"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useMachine } from "@xstate/react"

import type { ProjectImageItem } from "@/lib/api/project-images"
import type { FilterReadModel } from "@/lib/editor/filter-working-image"
import type { MasterImage } from "@/lib/editor/master-image"
import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"

import { createImageWorkflowMachine } from "./image-workflow.machine"
import type {
  ImageWorkflowEvent,
  ImageWorkflowServices,
  WorkflowTransformPayload,
} from "./image-workflow.types"
import { waitForStateChange } from "./wait-for-state-change"

const WORKFLOW_WAIT_TIMEOUT_MS = 20_000

export function useImageWorkflowMachine(args: {
  projectId?: string
  services: ImageWorkflowServices
  initialMaster?: MasterImage | null
}) {
  const machine = useMemo(() => createImageWorkflowMachine(), [])
  // `useMachine` reads `input` only at creation (SSR seed); later `initialMaster`
  // changes are ignored — live updates flow through MASTER_LOADED. Passing it
  // directly is fine (it's a prop, not a ref).
  const [state, send, actorRef] = useMachine(machine, {
    input: { services: args.services, initialMaster: args.initialMaster ?? null },
  })
  const prevStateRef = useRef<string | null>(null)
  const lastEventRef = useRef<string>("INIT")
  const refreshWaitRef = useRef<Promise<void> | null>(null)

  const sendEvent = useCallback((event: ImageWorkflowEvent) => {
    lastEventRef.current = event.type
    send(event)
  }, [send])

  useEffect(() => {
    sendEvent({ type: "SERVICES_UPDATE", services: args.services })
  }, [args.services, sendEvent])

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const source = state.value.source
    const operation = state.value.operation
    const persistence = state.value.persistence
    const current = `${String(source)}|${String(operation)}|${String(persistence)}`
    if (prevStateRef.current === current) return

    console.info("[image-workflow]", {
      projectId: args.projectId ?? null,
      imageId: state.context.source.image?.id ?? null,
      event: lastEventRef.current,
      stateFrom: prevStateRef.current ?? "init",
      stateTo: current,
      sourceState: source,
      operationState: operation,
      persistenceState: persistence,
      stage: state.context.lastOperation,
      code: state.context.lastOpError ? "operation_error" : state.context.lastPersistenceError ? "persistence_error" : "ok",
    })
    prevStateRef.current = current
  }, [args.projectId, state])

  const readModel = useMemo(() => state.context.source, [state.context.source])
  const projectImages = state.context.projectImages
  const master = state.context.master
  const masterLoading = state.context.masterLoading
  const masterError = state.context.masterError
  const masterRowId = state.context.master?.masterRowId ?? null
  const filter = state.context.filter
  const isMutating = state.matches({ operation: "removingFilter" }) || state.matches({ operation: "cropping" }) || state.matches({ operation: "restoring" })
    || state.matches({ operation: "applyingFilter" }) || state.matches({ operation: "applyingTrace" }) || state.matches({ operation: "clearingTrace" })
    || state.matches({ operation: "uploadingMaster" }) || state.matches({ operation: "deletingMaster" })
  const isSyncing = state.matches({ operation: "syncing" })
  const isPersisting = state.matches({ persistence: "persisting" }) || state.matches({ persistence: "drain" })
  const isApplyingFilter = state.matches({ operation: "applyingFilter" })
  const isRemovingFilter = state.matches({ operation: "removingFilter" })
  const isApplyingTrace = state.matches({ operation: "applyingTrace" })
  const isClearingTrace = state.matches({ operation: "clearingTrace" })
  const isUploadingMaster = state.matches({ operation: "uploadingMaster" })
  const isDeletingMaster = state.matches({ operation: "deletingMaster" })
  const isCropping = state.matches({ operation: "cropping" })
  const isRestoring = state.matches({ operation: "restoring" })
  const lastOperation = state.context.lastOperation
  const operationError = state.context.lastOpError
  const persistenceError = state.context.lastPersistenceError

  const applyFilter = (args: { filterType: RegisteredFilterId; filterParams: Record<string, unknown> }) => {
    if (!state.can({ type: "FILTER_APPLY", filterType: args.filterType, filterParams: args.filterParams })) {
      return Promise.reject(new Error("Filter apply is not allowed in the current workflow state"))
    }
    let enteredMutationFlow = false
    const pending = waitForStateChange({
      actor: actorRef,
      timeoutMs: WORKFLOW_WAIT_TIMEOUT_MS,
      timeoutMessage: "Timed out while waiting for filter workflow completion",
      evaluate: (snapshot) => {
        const isApplying = snapshot.matches({ operation: "applyingFilter" })
        const isSyncing = snapshot.matches({ operation: "syncing" })
        const isIdle = snapshot.matches({ operation: "idle" })
        const isError = snapshot.matches({ operation: "error" })

        if (isApplying || isSyncing) enteredMutationFlow = true
        if (!enteredMutationFlow) return null

        if (isError) return new Error(snapshot.context.lastOpError?.message ?? "Failed to apply filter")
        if (isIdle) return "resolve"
        return null
      },
    })
    sendEvent({ type: "FILTER_APPLY", filterType: args.filterType, filterParams: args.filterParams })
    return pending
  }
  const refreshAndWait = () => {
    if (refreshWaitRef.current) return refreshWaitRef.current
    if (!state.matches({ operation: "syncing" }) && !state.can({ type: "REFRESH" })) {
      return Promise.reject(new Error("Refresh is not allowed in the current workflow state"))
    }
    let enteredSync = state.matches({ operation: "syncing" })
    const pending = waitForStateChange({
      actor: actorRef,
      timeoutMs: WORKFLOW_WAIT_TIMEOUT_MS,
      timeoutMessage: "Timed out while waiting for workflow refresh",
      // Clear the cache before the promise settles so the next caller
      // gets a fresh subscription instead of a settled-rejected one.
      onSettle: () => { refreshWaitRef.current = null },
      evaluate: (snapshot) => {
        const isSyncingNow = snapshot.matches({ operation: "syncing" })
        const isIdleNow = snapshot.matches({ operation: "idle" })
        const isErrorNow = snapshot.matches({ operation: "error" })

        if (isSyncingNow) enteredSync = true
        if (!enteredSync) return null

        if (isErrorNow) return new Error(snapshot.context.lastOpError?.message ?? "Failed to refresh workflow source")
        if (isIdleNow) return "resolve"
        return null
      },
    })
    refreshWaitRef.current = pending
    if (!state.matches({ operation: "syncing" })) {
      sendEvent({ type: "REFRESH" })
    }
    return pending
  }
  const awaitOperation = (
    args: {
      start: () => void
      mutatingState: "applyingTrace" | "clearingTrace" | "removingFilter" | "deletingMaster"
      failMessage: string
      timeoutMessage: string
    },
  ) => {
    let enteredMutationFlow = false
    const pending = waitForStateChange({
      actor: actorRef,
      timeoutMs: WORKFLOW_WAIT_TIMEOUT_MS,
      timeoutMessage: args.timeoutMessage,
      evaluate: (snapshot) => {
        const isMutatingNow = snapshot.matches({ operation: args.mutatingState })
        const isSyncingNow = snapshot.matches({ operation: "syncing" })
        const isIdleNow = snapshot.matches({ operation: "idle" })
        const isErrorNow = snapshot.matches({ operation: "error" })
        if (isMutatingNow || isSyncingNow) enteredMutationFlow = true
        if (!enteredMutationFlow) return null
        if (isErrorNow) return new Error(snapshot.context.lastOpError?.message ?? args.failMessage)
        if (isIdleNow) return "resolve"
        return null
      },
    })
    args.start()
    return pending
  }
  const applyTrace = (args: { kind: RegisteredTraceId; params: Record<string, unknown> }) => {
    if (!state.can({ type: "TRACE_APPLY", kind: args.kind, params: args.params })) {
      return Promise.reject(new Error("Trace apply is not allowed in the current workflow state"))
    }
    return awaitOperation({
      start: () => sendEvent({ type: "TRACE_APPLY", kind: args.kind, params: args.params }),
      mutatingState: "applyingTrace",
      failMessage: "Failed to apply trace",
      timeoutMessage: "Timed out while waiting for trace apply completion",
    })
  }
  const clearTrace = () => {
    if (!state.can({ type: "TRACE_REMOVE" })) {
      return Promise.reject(new Error("Trace remove is not allowed in the current workflow state"))
    }
    return awaitOperation({
      start: () => sendEvent({ type: "TRACE_REMOVE" }),
      mutatingState: "clearingTrace",
      failMessage: "Failed to remove trace",
      timeoutMessage: "Timed out while waiting for trace remove completion",
    })
  }
  const removeFilter = (filterId: string) => sendEvent({ type: "FILTER_REMOVE", filterId })
  const uploadMaster = (master: UploadedMasterSnapshot) => {
    // Fire-and-forget: the seed is instant and the UI reads it from the source
    // snapshot; blocking on the machine's syncing would reintroduce the 20s wait
    // the upload path deliberately avoids.
    sendEvent({ type: "IMAGE_UPLOAD", master })
  }
  const deleteMaster = () => {
    if (!state.can({ type: "IMAGE_DELETE" })) {
      return Promise.reject(new Error("Image delete is not allowed in the current workflow state"))
    }
    return awaitOperation({
      start: () => sendEvent({ type: "IMAGE_DELETE" }),
      mutatingState: "deletingMaster",
      failMessage: "Failed to delete image",
      timeoutMessage: "Timed out while waiting for image delete completion",
    })
  }
  const applyCrop = (rect: { x: number; y: number; w: number; h: number }) => sendEvent({ type: "CROP_APPLY", rect })
  const restore = () => sendEvent({ type: "RESTORE" })
  const refresh = () => sendEvent({ type: "REFRESH" })
  const retry = () => sendEvent({ type: "RETRY" })
  const dismissError = () => sendEvent({ type: "DISMISS_ERROR" })
  const saveTransform = (transform: WorkflowTransformPayload) => sendEvent({ type: "TRANSFORM_SAVE", transform })
  // Stable identity: consumed in an effect dependency (the shell's cascade
  // loader). `sendEvent` is already stable, so this never changes across renders
  // — without useCallback the loader effect would re-fire every render → loop.
  const setProjectImages = useCallback(
    (items: ProjectImageItem[]) => sendEvent({ type: "PROJECT_IMAGES_LOADED", items }),
    [sendEvent],
  )
  // The filter read-model is machine-owned (phase C). `source` is derived
  // internally from master + filter — no more SOURCE_SNAPSHOT mirror. The
  // adapter's loader pushes filter data in via this stable sender.
  const setFilter = useCallback(
    (patch: Partial<FilterReadModel>) => sendEvent({ type: "FILTER_LOADED", patch }),
    [sendEvent],
  )
  // Stable identity (consumed in the adapter's loader effect deps).
  const setMaster = useCallback(
    (next: { master: MasterImage | null; loading?: boolean; error?: string }) =>
      sendEvent({ type: "MASTER_LOADED", master: next.master, loading: next.loading, error: next.error }),
    [sendEvent],
  )

  return {
    state,
    readModel,
    projectImages,
    setProjectImages,
    master,
    masterLoading,
    masterError,
    masterRowId,
    setMaster,
    filter,
    setFilter,
    isMutating,
    isSyncing,
    isPersisting,
    isApplyingFilter,
    isRemovingFilter,
    isApplyingTrace,
    isClearingTrace,
    isUploadingMaster,
    isDeletingMaster,
    isCropping,
    isRestoring,
    lastOperation,
    operationError,
    persistenceError,
    applyFilter,
    applyTrace,
    clearTrace,
    uploadMaster,
    deleteMaster,
    refreshAndWait,
    removeFilter,
    applyCrop,
    restore,
    refresh,
    retry,
    dismissError,
    saveTransform,
  }
}

