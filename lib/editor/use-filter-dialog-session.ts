"use client"

import { useCallback, useMemo, useState } from "react"

import type { FilterDisplayImage } from "@/lib/editor/use-filter-working-image"

export type FilterType = "pixelate" | "lineart" | "numerate"

type FilterDialogSession = {
  sourceImageId: string
  sourceImageWidth: number
  sourceImageHeight: number
  sourceImageUrl: string
}

type FilterDialogState =
  | { phase: "idle" }
  | { phase: "selecting"; session: FilterDialogSession }
  | { phase: "configuring"; session: FilterDialogSession; filterType: FilterType }

function toSession(image: FilterDisplayImage): FilterDialogSession {
  return {
    sourceImageId: image.id,
    sourceImageWidth: image.width_px,
    sourceImageHeight: image.height_px,
    sourceImageUrl: image.signedUrl,
  }
}

export function useFilterDialogSession(filterDisplayImage: FilterDisplayImage | null) {
  const [state, setState] = useState<FilterDialogState>({ phase: "idle" })
  const [error, setError] = useState("")

  const beginSelection = useCallback(() => {
    if (!filterDisplayImage) {
      setError("No active image available for filtering.")
      return false
    }
    setError("")
    setState({ phase: "selecting", session: toSession(filterDisplayImage) })
    return true
  }, [filterDisplayImage])

  const closeSelection = useCallback(() => {
    setState({ phase: "idle" })
  }, [])

  const selectFilterType = useCallback((filterType: FilterType) => {
    setState((prev) => {
      if (prev.phase !== "selecting") return prev
      return { phase: "configuring", session: prev.session, filterType }
    })
  }, [])

  const closeConfigure = useCallback(() => {
    setState({ phase: "idle" })
  }, [])

  const reset = useCallback(() => {
    setError("")
    setState({ phase: "idle" })
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
    ]
  )
}
