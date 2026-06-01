"use client"

import { useCallback, useLayoutEffect, useMemo, useReducer, useState } from "react"

import {
  filterDialogReducer,
  initialFilterDialogState,
  toFilterDialogSession,
  type FilterDialogSourceImage,
  type FilterType,
} from "@/lib/editor/dialogs/filter-dialog-state"

export type { FilterDialogSourceImage, FilterType }

/**
 * @param surfaceActive True when the owning editor surface (the Filter
 *   section, desktop tab or mobile bottom-nav) is the active one.
 *   Flipping false auto-resets the dialog to idle — same contract as
 *   `useTraceDialogSession` (the twin hook). Reuses the existing
 *   `reset` action; reducer is idempotent on reset-from-idle so the
 *   effect is a no-op when no dialog is open.
 */
export function useFilterDialogSession(
  sourceImage: FilterDialogSourceImage | null,
  surfaceActive: boolean,
) {
  const [state, dispatch] = useReducer(filterDialogReducer, initialFilterDialogState)
  const [error, setError] = useState("")

  // useLayoutEffect (not useEffect) for the same reason as the trace
  // twin — synchronous reset before paint, no one-frame flash of the
  // configure modal on the new section.
  useLayoutEffect(() => {
    if (surfaceActive) return
    // Mirror of `useTraceDialogSession`'s dismissal effect — see that
    // file for the rationale on the eslint suppression. Same lifecycle
    // contract: surface inactive → dialog idle + error cleared.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError("")
    dispatch({ type: "reset" })
  }, [surfaceActive])

  const beginSelection = useCallback(() => {
    if (!sourceImage) {
      setError("No active image available for filtering.")
      return false
    }
    setError("")
    dispatch({ type: "beginSelection", session: toFilterDialogSession(sourceImage) })
    return true
  }, [sourceImage])

  const closeSelection = useCallback(() => {
    dispatch({ type: "closeSelection" })
  }, [])

  const selectFilterType = useCallback((filterType: FilterType) => {
    dispatch({ type: "selectFilterType", filterType })
  }, [])

  const closeConfigure = useCallback(() => {
    dispatch({ type: "closeConfigure" })
  }, [])

  const reset = useCallback(() => {
    setError("")
    dispatch({ type: "reset" })
  }, [])

  const selectionOpen = state.phase === "selecting"
  const activeFilterType = state.phase === "configuring" ? state.filterType : null
  const session = state.phase === "idle" ? null : state.session

  return useMemo(
    () => ({
      state,
      session,
      selectionOpen,
      activeFilterType,
      error,
      setError,
      beginSelection,
      closeSelection,
      selectFilterType,
      closeConfigure,
      reset,
    }),
    [
      activeFilterType,
      beginSelection,
      closeConfigure,
      closeSelection,
      error,
      reset,
      selectionOpen,
      selectFilterType,
      session,
      state,
    ],
  )
}
