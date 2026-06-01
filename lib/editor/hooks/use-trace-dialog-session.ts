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
import { useCallback, useEffect, useMemo, useReducer, useState } from "react"

import {
  initialTraceDialogState,
  toTraceDialogSession,
  traceDialogReducer,
  type TraceDialogSourceImage,
  type TraceKind,
} from "@/lib/editor/dialogs/trace-dialog-state"

export type { TraceDialogSourceImage, TraceKind }

/**
 * @param surfaceActive True when the owning editor surface (the Trace
 *   section, desktop tab or mobile bottom-nav) is the active one.
 *   Flipping false auto-resets the dialog to idle so the modal can't
 *   outlive its surface — the user can't end up on the Image / Filter
 *   tab with a Trace configure dialog still floating on top.
 *   Reuses the existing `reset` action; reducer is idempotent on
 *   reset-from-idle so the effect is a no-op when no dialog is open.
 */
export function useTraceDialogSession(
  sourceImage: TraceDialogSourceImage | null,
  surfaceActive: boolean,
) {
  const [state, dispatch] = useReducer(traceDialogReducer, initialTraceDialogState)
  const [error, setError] = useState("")

  useEffect(() => {
    if (surfaceActive) return
    // Section-owned dialog dismissal: the owning surface (the Trace
    // section) is no longer active, so any open dialog must close and
    // any stale error must clear before the user comes back to the
    // surface. Both pieces of state are dialog lifecycle; treating
    // them together is correct. `error` lives in `useState` (not the
    // reducer) for historical reasons — collapsing into the reducer
    // is a follow-up that would let this effect dispatch a single
    // action without the eslint suppression.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError("")
    dispatch({ type: "reset" })
  }, [surfaceActive])

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
