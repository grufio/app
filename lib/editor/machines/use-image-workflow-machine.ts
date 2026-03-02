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

export function useImageWorkflowMachine(args: {
  projectId?: string
  sourceSnapshot: WorkflowSourceSnapshot
  services: ImageWorkflowServices
}) {
  const machine = useMemo(() => createImageWorkflowMachine(), [])
  const [state, send, actorRef] = useMachine(machine, { input: { services: args.services } })
  const prevStateRef = useRef<string | null>(null)
  const lastEventRef = useRef<string>("INIT")

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
      let enteredMutationFlow = false
      const sub = actorRef.subscribe((snapshot) => {
        const isApplying = snapshot.matches({ operation: "applyingFilter" })
        const isSyncing = snapshot.matches({ operation: "syncing" })
        const isIdle = snapshot.matches({ operation: "idle" })
        const isError = snapshot.matches({ operation: "error" })

        if (isApplying || isSyncing) enteredMutationFlow = true
        if (!enteredMutationFlow) return

        if (isError) {
          sub.unsubscribe()
          reject(new Error(snapshot.context.lastOpError || "Failed to apply filter"))
          return
        }
        if (isIdle) {
          sub.unsubscribe()
          resolve()
        }
      })
      sendEvent({ type: "FILTER_APPLY", filterType: args.filterType, filterParams: args.filterParams })
    })
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
    removeFilter,
    applyCrop,
    restore,
    refresh,
    retry,
    dismissError,
    saveTransform,
  }
}

