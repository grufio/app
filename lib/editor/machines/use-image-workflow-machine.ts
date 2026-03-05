"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { useMachine } from "@xstate/react"

import { createImageWorkflowMachine } from "./image-workflow.machine"
import type {
  ImageWorkflowEvent,
  ImageWorkflowServices,
  WorkflowSourceSnapshot,
  WorkflowTransformPayload,
} from "./image-workflow.types"

const WORKFLOW_WAIT_TIMEOUT_MS = 20_000

export function useImageWorkflowMachine(args: {
  projectId?: string
  sourceSnapshot: WorkflowSourceSnapshot
  services: ImageWorkflowServices
}) {
  const machine = useMemo(() => createImageWorkflowMachine(), [])
  const [state, send, actorRef] = useMachine(machine, { input: { services: args.services } })
  const prevStateRef = useRef<string | null>(null)
  const lastEventRef = useRef<string>("INIT")
  const refreshWaitRef = useRef<Promise<void> | null>(null)

  const sendEvent = useCallback((event: ImageWorkflowEvent) => {
    lastEventRef.current = event.type
    send(event)
  }, [send])

  useEffect(() => {
    sendEvent({ type: "SOURCE_SNAPSHOT", snapshot: args.sourceSnapshot })
  }, [args.sourceSnapshot, sendEvent])
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
  const isMutating = state.matches({ operation: "removingFilter" }) || state.matches({ operation: "cropping" }) || state.matches({ operation: "restoring" })
    || state.matches({ operation: "applyingFilter" })
  const isSyncing = state.matches({ operation: "syncing" })
  const isPersisting = state.matches({ persistence: "persisting" }) || state.matches({ persistence: "drain" })
  const isApplyingFilter = state.matches({ operation: "applyingFilter" })
  const isRemovingFilter = state.matches({ operation: "removingFilter" })
  const isCropping = state.matches({ operation: "cropping" })
  const isRestoring = state.matches({ operation: "restoring" })
  const lastOperation = state.context.lastOperation
  const operationError = state.context.lastOpError
  const persistenceError = state.context.lastPersistenceError

  const applyFilter = (args: { filterType: "pixelate" | "lineart" | "numerate"; filterParams: Record<string, unknown> }) =>
    new Promise<void>((resolve, reject) => {
      if (!state.can({ type: "FILTER_APPLY", filterType: args.filterType, filterParams: args.filterParams })) {
        reject(new Error("Filter apply is not allowed in the current workflow state"))
        return
      }
      let enteredMutationFlow = false
      const timeout = window.setTimeout(() => {
        sub.unsubscribe()
        reject(new Error("Timed out while waiting for filter workflow completion"))
      }, WORKFLOW_WAIT_TIMEOUT_MS)
      const sub = actorRef.subscribe((snapshot) => {
        const isApplying = snapshot.matches({ operation: "applyingFilter" })
        const isSyncing = snapshot.matches({ operation: "syncing" })
        const isIdle = snapshot.matches({ operation: "idle" })
        const isError = snapshot.matches({ operation: "error" })

        if (isApplying || isSyncing) enteredMutationFlow = true
        if (!enteredMutationFlow) return

        if (isError) {
          window.clearTimeout(timeout)
          sub.unsubscribe()
          reject(new Error(snapshot.context.lastOpError || "Failed to apply filter"))
          return
        }
        if (isIdle) {
          window.clearTimeout(timeout)
          sub.unsubscribe()
          resolve()
        }
      })
      sendEvent({ type: "FILTER_APPLY", filterType: args.filterType, filterParams: args.filterParams })
    })
  const refreshAndWait = () =>
    (refreshWaitRef.current ??=
    new Promise<void>((resolve, reject) => {
      if (!state.matches({ operation: "syncing" }) && !state.can({ type: "REFRESH" })) {
        refreshWaitRef.current = null
        reject(new Error("Refresh is not allowed in the current workflow state"))
        return
      }
      let enteredSync = state.matches({ operation: "syncing" })
      const timeout = window.setTimeout(() => {
        sub.unsubscribe()
        refreshWaitRef.current = null
        reject(new Error("Timed out while waiting for workflow refresh"))
      }, WORKFLOW_WAIT_TIMEOUT_MS)
      const sub = actorRef.subscribe((snapshot) => {
        const isSyncingNow = snapshot.matches({ operation: "syncing" })
        const isIdleNow = snapshot.matches({ operation: "idle" })
        const isErrorNow = snapshot.matches({ operation: "error" })

        if (isSyncingNow) enteredSync = true
        if (!enteredSync) return

        if (isErrorNow) {
          window.clearTimeout(timeout)
          sub.unsubscribe()
          refreshWaitRef.current = null
          reject(new Error(snapshot.context.lastOpError || "Failed to refresh workflow source"))
          return
        }
        if (isIdleNow) {
          window.clearTimeout(timeout)
          sub.unsubscribe()
          refreshWaitRef.current = null
          resolve()
        }
      })

      if (!state.matches({ operation: "syncing" })) {
        sendEvent({ type: "REFRESH" })
      }
    }))
  const removeFilter = (filterId: string) => sendEvent({ type: "FILTER_REMOVE", filterId })
  const applyCrop = (rect: { x: number; y: number; w: number; h: number }) => sendEvent({ type: "CROP_APPLY", rect })
  const restore = () => sendEvent({ type: "RESTORE" })
  const refresh = () => sendEvent({ type: "REFRESH" })
  const retry = () => sendEvent({ type: "RETRY" })
  const dismissError = () => sendEvent({ type: "DISMISS_ERROR" })
  const saveTransform = (transform: WorkflowTransformPayload) => sendEvent({ type: "TRANSFORM_SAVE", transform })

  return {
    state,
    readModel,
    isMutating,
    isSyncing,
    isPersisting,
    isApplyingFilter,
    isRemovingFilter,
    isCropping,
    isRestoring,
    lastOperation,
    operationError,
    persistenceError,
    applyFilter,
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

