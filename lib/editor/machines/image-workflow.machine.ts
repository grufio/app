import { assign, fromPromise, raise, setup } from "xstate"

import { normalizeApiError } from "@/lib/api/error-normalizer"
import type { OperationError } from "@/lib/api/operation-error"
import { initialFilterReadModel, type FilterReadModelData } from "@/lib/editor/filter-working-image"
import { masterImageSignature, toMasterImage, type MasterImage } from "@/lib/editor/master-image"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"

import { deriveSource } from "./derive-source"
import type {
  ImageWorkflowContext,
  ImageWorkflowEvent,
  ImageWorkflowServices,
  WorkflowSourceSnapshot,
  WorkflowTransformPayload,
} from "./image-workflow.types"

type MachineInput = {
  services: ImageWorkflowServices
  /** SSR-provided master (read-model phase B). When present the machine skips
   * the initial fetch — the adapter only loads on mount if this is null. */
  initialMaster?: MasterImage | null
}

/**
 * Convert a caught xstate-actor error into a canonical `OperationError`.
 * The actor's `error` event payload is typed as `unknown` (xstate-react),
 * so we widen-then-normalize. `fallbackMessage` is only used when the
 * underlying error provides no usable message at all.
 */
function toUnknownOperationError(error: unknown, fallbackMessage: string): OperationError {
  const normalized = normalizeApiError(error)
  if (normalized.message.trim()) return normalized
  return { ...normalized, message: fallbackMessage }
}

/**
 * Hard backstop for a Cloud-Run apply whose promise never settles (e.g. the
 * browser fetch stalls on a dead network — fetch has no default timeout, so the
 * invoked actor would otherwise sit in `applyingFilter`/`applyingTrace` forever
 * and strand the machine).
 *
 * MUST sit safely ABOVE the longest LEGITIMATE apply, or it would false-fire on
 * a genuine slow trace and discard a result that actually completed server-side.
 * Worst legit case (trace): the actor runs `saveImageState` (~a few s) and THEN
 * the trace call, whose server ceiling is the route's `maxDuration = 120s`
 * (app/api/projects/[projectId]/trace/route.ts) — so client-observed
 * `applyingTrace` can approach ~125s at the cold-start + high-MP operating
 * point. 180s leaves a comfortable margin: it only trips a truly hung fetch.
 * Kept BELOW the hook's apply wait (`WORKFLOW_APPLY_TIMEOUT_MS`, 190s) so the
 * machine reaches `error` first and the UI promise settles via the real error
 * path (with a message), retryable from `error`, rather than the bare UI timeout.
 */
const APPLY_ACTOR_TIMEOUT_MS = 180_000

/** Synthetic error for the apply backstop — the `after` transition carries no
 * `event.error`, so we assign a canonical timeout `OperationError` directly. */
const APPLY_TIMEOUT_ERROR: OperationError = {
  stage: "timeout",
  code: "APPLY_TIMEOUT",
  message: "The operation took too long and was stopped. Please try again.",
}

export function createImageWorkflowMachine() {
  return setup({
    types: {
      context: {} as ImageWorkflowContext,
      events: {} as ImageWorkflowEvent,
      input: {} as MachineInput,
    },
    actors: {
      applyFilter: fromPromise(
        async ({ input }: { input: { services: ImageWorkflowServices; filterType: RegisteredFilterId; filterParams: Record<string, unknown> } }) => {
          await input.services.applyFilter({
            filterType: input.filterType,
            filterParams: input.filterParams,
          })
        }
      ),
      removeFilter: fromPromise(async ({ input }: { input: { services: ImageWorkflowServices; filterId: string } }) => {
        await input.services.removeFilter(input.filterId)
      }),
      applyTrace: fromPromise(
        async ({ input }: { input: { services: ImageWorkflowServices; kind: RegisteredTraceId; params: Record<string, unknown> } }) => {
          await input.services.applyTrace({ kind: input.kind, params: input.params })
        }
      ),
      clearTrace: fromPromise(async ({ input }: { input: { services: ImageWorkflowServices } }) => {
        await input.services.clearTrace()
      }),
      uploadMaster: fromPromise(async ({ input }: { input: { services: ImageWorkflowServices; master: UploadedMasterSnapshot } }) => {
        await input.services.uploadMaster({ master: input.master })
      }),
      deleteMaster: fromPromise(async ({ input }: { input: { services: ImageWorkflowServices } }) => {
        await input.services.deleteMaster()
      }),
      applyCrop: fromPromise(
        async ({ input }: { input: { services: ImageWorkflowServices; sourceImageId: string; rect: { x: number; y: number; w: number; h: number } } }) => {
          await input.services.applyCrop({ sourceImageId: input.sourceImageId, rect: input.rect })
        }
      ),
      restoreBase: fromPromise(async ({ input }: { input: { services: ImageWorkflowServices } }) => {
        await input.services.restoreBase()
      }),
      refreshAll: fromPromise(async ({ input }: { input: { services: ImageWorkflowServices } }) => {
        return await input.services.refreshAll()
      }),
      persistTransform: fromPromise(
        async ({ input }: { input: { services: ImageWorkflowServices; transform: WorkflowTransformPayload } }) => {
          await input.services.saveTransform({ transform: input.transform })
        }
      ),
    },
    guards: {
      hasActiveImage: ({ context }) => context.source.status === "ready" && Boolean(context.source.image?.id),
      hasInFlightTransform: ({ context }) => Boolean(context.inFlightTransform),
      hasPendingTransform: ({ context }) => Boolean(context.pendingTransform),
      canMutate: ({ context }) => context.source.status === "ready" && Boolean(context.source.image?.id),
    },
    actions: {
      // Re-derive `context.source` from the master + filter slices. Runs after
      // every slice change (raised as SOURCE_RECOMPUTE) so `source` — and the
      // `canMutate`/`hasActiveImage` guards that read it — stay consistent.
      recomputeSource: assign({ source: ({ context }) => deriveSource(context) }),
      raiseRecompute: raise({ type: "SOURCE_RECOMPUTE" }),
      // Merge a filter read-model patch (loading start, loaded data, or error).
      assignFilter: assign({
        filter: ({ event, context }) =>
          event.type === "FILTER_LOADED" ? { ...context.filter, ...event.patch } : context.filter,
      }),
      assignProjectImages: assign({
        projectImages: ({ event, context }) => (event.type === "PROJECT_IMAGES_LOADED" ? event.items : context.projectImages),
      }),
      // Assign the master with signature dedup: keep the SAME object identity
      // when nothing meaningful changed, so the derived source snapshot doesn't
      // churn (and the shell's loader effect doesn't re-fire).
      //
      // Invariant: a background load NEVER nulls a present master. Only
      // IMAGE_DELETE clears it (via `clearMaster`); every other flow keeps it.
      // `getMasterImage` can legitimately return null while the image exists
      // (transient signed-URL failure, read lag, `.catch(() => null)`), and the
      // loader's "loading" tick sends `master: null` up front — so a null here
      // is treated as stale and the current master is preserved (only the
      // loading/error flags update). See the post-upload clobber this fixes.
      assignMaster: assign(({ event, context }) => {
        if (event.type !== "MASTER_LOADED") return {}
        const next = event.master ?? context.master
        const same = masterImageSignature(next) === masterImageSignature(context.master)
        return {
          master: same ? context.master : next,
          masterLoading: event.loading ?? false,
          masterError: event.error ?? "",
        }
      }),
      assignMasterFromUpload: assign(({ event, context }) => {
        if (event.type !== "IMAGE_UPLOAD") return {}
        // The fresh upload IS the master row → masterRowId is its own id.
        const master = toMasterImage({ ...event.master, masterRowId: event.master.id })
        const same = masterImageSignature(master) === masterImageSignature(context.master)
        return { master: same ? context.master : master, masterLoading: false, masterError: "" }
      }),
      clearMaster: assign({ master: null, masterError: "" }),
      assignFromRefresh: assign(({ event, context }) => {
        // The `syncing` invoke resolves with the refreshAll output (master + filter).
        const output = (event as { output?: { master: MasterImage | null; filter: FilterReadModelData } }).output
        if (!output) return {}
        // Same invariant as `assignMaster`: a post-mutation refresh must not null
        // a present master (deletes clear it via `clearMaster` before syncing).
        // A null master result from `refreshAll` is stale/transient — keep the
        // one we have so a just-seeded upload survives the reconcile.
        const next = output.master ?? context.master
        const same = masterImageSignature(next) === masterImageSignature(context.master)
        return {
          master: same ? context.master : next,
          masterLoading: false,
          masterError: "",
          filter: { ...context.filter, ...output.filter, loading: false, loadedOnce: true },
        }
      }),
      assignServices: assign({
        services: ({ event, context }) => (event.type === "SERVICES_UPDATE" ? event.services : context.services),
      }),
      clearOperationError: assign({
        lastOpError: null,
      }),
      clearPersistenceError: assign({
        lastPersistenceError: null,
      }),
      assignLastOperation: assign({
        lastOperation: ({ event, context }) => {
          if (event.type === "FILTER_APPLY") return "filter_apply"
          if (event.type === "FILTER_REMOVE") return "filter_remove"
          if (event.type === "TRACE_APPLY") return "trace_apply"
          if (event.type === "TRACE_REMOVE") return "trace_remove"
          if (event.type === "IMAGE_UPLOAD") return "image_upload"
          if (event.type === "IMAGE_DELETE") return "image_delete"
          if (event.type === "CROP_APPLY") return "crop_apply"
          if (event.type === "RESTORE") return "restore"
          if (event.type === "REFRESH" || event.type === "RETRY") return "refresh"
          return context.lastOperation
        },
      }),
      assignOperationFailure: assign({
        lastOpError: ({ event }) =>
          toUnknownOperationError((event as { error?: unknown }).error, "Image workflow operation failed."),
      }),
      assignOperationTimeout: assign({
        lastOpError: () => APPLY_TIMEOUT_ERROR,
      }),
      assignPersistenceFailure: assign({
        lastPersistenceError: ({ event }) =>
          toUnknownOperationError((event as { error?: unknown }).error, "Failed to save image transform."),
      }),
      queueOrStartTransform: assign({
        inFlightTransform: ({ context, event }) => {
          if (event.type !== "TRANSFORM_SAVE") return context.inFlightTransform
          if (context.inFlightTransform) return context.inFlightTransform
          return event.transform
        },
        pendingTransform: ({ context, event }) => {
          if (event.type !== "TRANSFORM_SAVE") return context.pendingTransform
          if (!context.inFlightTransform) return context.pendingTransform
          return event.transform
        },
      }),
      queuePendingTransform: assign({
        pendingTransform: ({ event, context }) => (event.type === "TRANSFORM_SAVE" ? event.transform : context.pendingTransform),
      }),
      clearInFlightTransform: assign({
        inFlightTransform: null,
      }),
      startPendingTransform: assign({
        inFlightTransform: ({ context }) => context.pendingTransform,
        pendingTransform: null,
      }),
    },
  }).createMachine({
    id: "imageWorkflow",
    type: "parallel",
    context: ({ input }) => ({
      services: input.services,
      source: { status: "loading", image: null, error: "" } as WorkflowSourceSnapshot,
      projectImages: [],
      master: input.initialMaster ?? null,
      masterLoading: false,
      masterError: "",
      filter: initialFilterReadModel,
      lastOperation: null,
      lastOpError: null,
      lastPersistenceError: null,
      inFlightTransform: null,
      pendingTransform: null,
    }),
    states: {
      source: {
        initial: "loading",
        states: {
          loading: {},
          ready: {},
          empty: {},
          error: {},
        },
        on: {
          // Internal re-derivation: the derived status picks the substate and
          // `recomputeSource` assigns the fresh snapshot into context. Raised
          // whenever the master or filter slice changes.
          SOURCE_RECOMPUTE: [
            {
              guard: ({ context }) => deriveSource(context).status === "ready",
              target: ".ready",
              actions: "recomputeSource",
            },
            {
              guard: ({ context }) => deriveSource(context).status === "empty",
              target: ".empty",
              actions: "recomputeSource",
            },
            {
              guard: ({ context }) => deriveSource(context).status === "error",
              target: ".error",
              actions: "recomputeSource",
            },
            {
              target: ".loading",
              actions: "recomputeSource",
            },
          ],
        },
      },
      operation: {
        initial: "idle",
        states: {
          idle: {
            on: {
              FILTER_REMOVE: {
                guard: "canMutate",
                target: "removingFilter",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              FILTER_APPLY: {
                guard: "canMutate",
                target: "applyingFilter",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              TRACE_APPLY: {
                guard: "canMutate",
                target: "applyingTrace",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              TRACE_REMOVE: {
                guard: "canMutate",
                target: "clearingTrace",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              IMAGE_UPLOAD: {
                // No canMutate guard: the upload CREATES the source (there may be
                // no active image yet, e.g. first upload or after a delete).
                // Seed the master into context instantly for fast UX.
                target: "uploadingMaster",
                actions: ["clearOperationError", "assignLastOperation", "assignMasterFromUpload", "raiseRecompute"],
              },
              IMAGE_DELETE: {
                guard: "canMutate",
                target: "deletingMaster",
                actions: ["clearOperationError", "assignLastOperation", "clearMaster", "raiseRecompute"],
              },
              CROP_APPLY: {
                guard: "canMutate",
                target: "cropping",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              RESTORE: {
                target: "restoring",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              RETRY: {
                target: "syncing",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              REFRESH: {
                target: "syncing",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              BOOT: {
                actions: "clearOperationError",
              },
            },
          },
          applyingFilter: {
            // Backstop: a stalled apply that never settles can't strand the machine.
            after: { [APPLY_ACTOR_TIMEOUT_MS]: { target: "error", actions: "assignOperationTimeout" } },
            invoke: {
              src: "applyFilter",
              input: ({ context, event }) => {
                if (event.type !== "FILTER_APPLY") throw new Error("Missing filter payload for applyFilter")
                return {
                  services: context.services,
                  filterType: event.filterType,
                  filterParams: event.filterParams,
                }
              },
              onDone: { target: "syncing" },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          removingFilter: {
            invoke: {
              src: "removeFilter",
              input: ({ context, event }) => {
                if (event.type !== "FILTER_REMOVE") throw new Error("Missing filterId for removeFilter")
                return { services: context.services, filterId: event.filterId }
              },
              onDone: { target: "syncing" },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          applyingTrace: {
            // Backstop: a stalled apply that never settles can't strand the machine.
            after: { [APPLY_ACTOR_TIMEOUT_MS]: { target: "error", actions: "assignOperationTimeout" } },
            invoke: {
              src: "applyTrace",
              input: ({ context, event }) => {
                if (event.type !== "TRACE_APPLY") throw new Error("Missing trace payload for applyTrace")
                return { services: context.services, kind: event.kind, params: event.params }
              },
              onDone: { target: "syncing" },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          clearingTrace: {
            invoke: {
              src: "clearTrace",
              input: ({ context }) => ({ services: context.services }),
              onDone: { target: "syncing" },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          uploadingMaster: {
            invoke: {
              src: "uploadMaster",
              input: ({ context, event }) => {
                if (event.type !== "IMAGE_UPLOAD") throw new Error("Missing master payload for uploadMaster")
                return { services: context.services, master: event.master }
              },
              onDone: { target: "syncing" },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          deletingMaster: {
            invoke: {
              src: "deleteMaster",
              input: ({ context }) => ({ services: context.services }),
              onDone: { target: "syncing" },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          cropping: {
            invoke: {
              src: "applyCrop",
              input: ({ context, event }) => {
                if (event.type !== "CROP_APPLY") throw new Error("Missing crop rect for applyCrop")
                const sourceImageId = context.source.image?.id
                if (!sourceImageId) throw new Error("No active source image for crop")
                return { services: context.services, sourceImageId, rect: event.rect }
              },
              onDone: { target: "syncing" },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          restoring: {
            invoke: {
              src: "restoreBase",
              input: ({ context }) => ({ services: context.services }),
              onDone: { target: "syncing" },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          syncing: {
            invoke: {
              src: "refreshAll",
              input: ({ context }) => ({ services: context.services }),
              onDone: { target: "idle", actions: ["assignFromRefresh", "raiseRecompute"] },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          error: {
            on: {
              // Retry an apply directly out of `error` — mirrors the `idle`
              // transitions so a failed/timed-out apply isn't a dead end (the
              // dialog/picker stays open on error; re-applying clears the error
              // and re-enters the flow instead of hitting the mutation guard).
              FILTER_APPLY: {
                guard: "canMutate",
                target: "applyingFilter",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              TRACE_APPLY: {
                guard: "canMutate",
                target: "applyingTrace",
                actions: ["clearOperationError", "assignLastOperation"],
              },
              DISMISS_ERROR: { target: "idle", actions: "clearOperationError" },
              RETRY: { target: "syncing", actions: ["clearOperationError", "assignLastOperation"] },
              REFRESH: { target: "syncing", actions: ["clearOperationError", "assignLastOperation"] },
            },
          },
        },
      },
      persistence: {
        initial: "idle",
        states: {
          idle: {
            on: {
              TRANSFORM_SAVE: {
                guard: "hasActiveImage",
                target: "persisting",
                actions: ["clearPersistenceError", "queueOrStartTransform"],
              },
            },
          },
          persisting: {
            on: {
              TRANSFORM_SAVE: { actions: "queuePendingTransform" },
            },
            invoke: {
              src: "persistTransform",
              input: ({ context }) => {
                if (!context.inFlightTransform) {
                  throw new Error("Missing transform payload for persist")
                }
                return {
                  services: context.services,
                  transform: context.inFlightTransform,
                }
              },
              onDone: {
                target: "drain",
                actions: "clearInFlightTransform",
              },
              onError: {
                target: "error",
                actions: ["assignPersistenceFailure", "clearInFlightTransform"],
              },
            },
          },
          drain: {
            always: [
              {
                guard: "hasPendingTransform",
                target: "persisting",
                actions: "startPendingTransform",
              },
              { target: "idle" },
            ],
          },
          error: {
            on: {
              DISMISS_ERROR: { target: "idle", actions: "clearPersistenceError" },
              TRANSFORM_SAVE: {
                guard: "hasActiveImage",
                target: "persisting",
                actions: ["clearPersistenceError", "queueOrStartTransform"],
              },
            },
          },
        },
      },
    },
    on: {
      SERVICES_UPDATE: {
        actions: "assignServices",
      },
      PROJECT_IMAGES_LOADED: {
        actions: "assignProjectImages",
      },
      MASTER_LOADED: {
        actions: ["assignMaster", "raiseRecompute"],
      },
      FILTER_LOADED: {
        actions: ["assignFilter", "raiseRecompute"],
      },
    },
  })
}

