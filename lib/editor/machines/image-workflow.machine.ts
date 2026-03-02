import { assign, fromPromise, setup } from "xstate"

import type {
  ImageWorkflowContext,
  ImageWorkflowEvent,
  ImageWorkflowServices,
  WorkflowSourceSnapshot,
  WorkflowTransformPayload,
} from "./image-workflow.types"

type MachineInput = {
  services: ImageWorkflowServices
}

function toUnknownErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
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
        async ({ input }: { input: { services: ImageWorkflowServices; filterType: "pixelate" | "lineart" | "numerate"; filterParams: Record<string, unknown> } }) => {
          await input.services.applyFilter({
            filterType: input.filterType,
            filterParams: input.filterParams,
          })
        }
      ),
      removeFilter: fromPromise(async ({ input }: { input: { services: ImageWorkflowServices; filterId: string } }) => {
        await input.services.removeFilter(input.filterId)
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
        await input.services.refreshAll()
      }),
      persistTransform: fromPromise(
        async ({ input }: { input: { services: ImageWorkflowServices; imageId: string; transform: WorkflowTransformPayload } }) => {
          await input.services.saveTransform({ imageId: input.imageId, transform: input.transform })
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
      assignServices: assign({
        services: ({ event, context }) => (event.type === "SERVICES_UPDATE" ? event.services : context.services),
      }),
      clearOperationError: assign({
        lastOpError: "",
      }),
      clearPersistenceError: assign({
        lastPersistenceError: "",
      }),
      assignLastOperation: assign({
        lastOperation: ({ event, context }) => {
          if (event.type === "FILTER_APPLY") return "filter_apply"
          if (event.type === "FILTER_REMOVE") return "filter_remove"
          if (event.type === "CROP_APPLY") return "crop_apply"
          if (event.type === "RESTORE") return "restore"
          if (event.type === "REFRESH" || event.type === "RETRY") return "refresh"
          return context.lastOperation
        },
      }),
      assignOperationFailure: assign({
        lastOpError: ({ event }) => toUnknownErrorMessage((event as { error?: unknown }).error, "Image workflow operation failed."),
      }),
      assignPersistenceFailure: assign({
        lastPersistenceError: ({ event }) => toUnknownErrorMessage((event as { error?: unknown }).error, "Failed to save image transform."),
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
      source: { status: "loading", image: null, error: "" } as WorkflowSourceSnapshot,
      lastOperation: null,
      lastOpError: "",
      lastPersistenceError: "",
      inFlightTransform: null,
      pendingTransform: null,
      ...input,
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
              onDone: { target: "idle" },
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
                if (!context.source.image?.id || !context.inFlightTransform) {
                  throw new Error("Missing image or transform payload for persist")
                }
                return {
                  services: context.services,
                  imageId: context.source.image.id,
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
    },
  })
}

