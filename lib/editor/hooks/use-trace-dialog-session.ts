"use client"

/**
 * Twin of `useFilterDialogSession` for the Trace surface (F21 PR2).
 *
 * Same selecting → configuring state shape as the Filter dialog so
 * the user's mental model stays consistent. The two surfaces stay
 * separate hooks because Trace is mutually exclusive (one active
 * per project) — replacing handles via `applyProjectTrace` overwrite,
 * not via a stack append.
 *
 * State transitions live in `lib/editor/dialogs/trace-dialog-state.ts`
 * so the rules can be tested without `renderHook`.
 */
import { useCallback, useMemo, useReducer, useState } from "react"

import {
  initialTraceDialogState,
  toTraceDialogSession,
  traceDialogReducer,
  type TraceDialogSourceImage,
  type TraceKind,
} from "@/lib/editor/dialogs/trace-dialog-state"

export type { TraceDialogSourceImage, TraceKind }

export function useTraceDialogSession(sourceImage: TraceDialogSourceImage | null) {
  const [state, dispatch] = useReducer(traceDialogReducer, initialTraceDialogState)
  const [error, setError] = useState("")

  const beginSelection = useCallback(() => {
    if (!sourceImage) {
      setError("No active image available for tracing.")
      return false
    }
    setError("")
    dispatch({ type: "beginSelection", session: toTraceDialogSession(sourceImage) })
    return true
  }, [sourceImage])

  const closeSelection = useCallback(() => {
    dispatch({ type: "closeSelection" })
  }, [])

  const selectKind = useCallback((kind: TraceKind) => {
    dispatch({ type: "selectKind", kind })
  }, [])

  const closeConfigure = useCallback(() => {
    dispatch({ type: "closeConfigure" })
  }, [])

  const reset = useCallback(() => {
    setError("")
    dispatch({ type: "reset" })
  }, [])

  const selectionOpen = state.phase === "selecting"
  const activeKind = state.phase === "configuring" ? state.kind : null
  const session = state.phase === "idle" ? null : state.session

  return useMemo(
    () => ({
      state,
      session,
      selectionOpen,
      activeKind,
      error,
      setError,
      beginSelection,
      closeSelection,
      selectKind,
      closeConfigure,
      reset,
    }),
    [
      activeKind,
      beginSelection,
      closeConfigure,
      closeSelection,
      error,
      reset,
      selectionOpen,
      selectKind,
      session,
      state,
    ],
  )
}
