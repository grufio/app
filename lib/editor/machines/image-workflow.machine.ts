import { assign, fromPromise, setup } from "xstate"

import { normalizeApiError } from "@/lib/api/error-normalizer"
import type { OperationError } from "@/lib/api/operation-error"
import { masterImageSignature, toMasterImage, type MasterImage } from "@/lib/editor/master-image"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"

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
      assignSourceSnapshot: assign({
        source: ({ event, context }) => (event.type === "SOURCE_SNAPSHOT" ? event.snapshot : context.source),
      }),
      assignProjectImages: assign({
        projectImages: ({ event, context }) => (event.type === "PROJECT_IMAGES_LOADED" ? event.items : context.projectImages),
      }),
      // Assign the master with signature dedup: keep the SAME object identity
      // when nothing meaningful changed, so the derived source snapshot doesn't
      // churn (and the shell's loader effect doesn't re-fire).
      assignMaster: assign(({ event, context }) => {
        if (event.type !== "MASTER_LOADED") return {}
        const same = masterImageSignature(event.master) === masterImageSignature(context.master)
        return {
          master: same ? context.master : event.master,
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
      assignMasterFromRefresh: assign(({ event, context }) => {
        // The `syncing` invoke resolves with the refreshAll output.
        const output = (event as { output?: { master: MasterImage | null } }).output
        if (!output) return {}
        const same = masterImageSignature(output.master) === masterImageSignature(context.master)
        return { master: same ? context.master : output.master, masterLoading: false, masterError: "" }
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
          SOURCE_SNAPSHOT: [
            {
              actions: "assignSourceSnapshot",
              guard: ({ event }) => event.snapshot.status === "ready",
              target: ".ready",
            },
            {
              actions: "assignSourceSnapshot",
              guard: ({ event }) => event.snapshot.status === "empty",
              target: ".empty",
            },
            {
              actions: "assignSourceSnapshot",
              guard: ({ event }) => event.snapshot.status === "error",
              target: ".error",
            },
            {
              actions: "assignSourceSnapshot",
              target: ".loading",
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
                actions: ["clearOperationError", "assignLastOperation", "assignMasterFromUpload"],
              },
              IMAGE_DELETE: {
                guard: "canMutate",
                target: "deletingMaster",
                actions: ["clearOperationError", "assignLastOperation", "clearMaster"],
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
              onDone: { target: "idle", actions: "assignMasterFromRefresh" },
              onError: { target: "error", actions: "assignOperationFailure" },
            },
          },
          error: {
            on: {
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
        actions: "assignMaster",
      },
    },
  })
}

