"use client"

import { useCallback, useMemo, useReducer, useState } from "react"

import {
  filterDialogReducer,
  initialFilterDialogState,
  toFilterDialogSession,
  type FilterDialogSourceImage,
  type FilterType,
} from "@/lib/editor/dialogs/filter-dialog-state"

export type { FilterDialogSourceImage, FilterType }

export function useFilterDialogSession(sourceImage: FilterDialogSourceImage | null) {
  const [state, dispatch] = useReducer(filterDialogReducer, initialFilterDialogState)
  const [error, setError] = useState("")

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
