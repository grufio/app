"use client"

/**
 * Twin of `useFilterDialogSession` for the Trace surface (F21 PR2).
 *
 * Same selecting → configuring state shape as the Filter dialog so
 * the user's mental model stays consistent. The two surfaces stay
 * separate hooks because Trace is mutually exclusive (one active
 * per project) — replacing handles via `applyProjectTrace` overwrite,
 * not via a stack append.
 */
import { useCallback, useMemo, useState } from "react"

import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export type TraceKind = RegisteredTraceId

type TraceDialogSourceImage = {
  id: string
  width_px: number
  height_px: number
  signedUrl: string
}

type TraceDialogSession = {
  sourceImageId: string
  sourceImageWidth: number
  sourceImageHeight: number
  sourceImageUrl: string
}

type TraceDialogState =
  | { phase: "idle" }
  | { phase: "selecting"; session: TraceDialogSession }
  | { phase: "configuring"; session: TraceDialogSession; kind: TraceKind }

function toSession(image: TraceDialogSourceImage): TraceDialogSession {
  return {
    sourceImageId: image.id,
    sourceImageWidth: image.width_px,
    sourceImageHeight: image.height_px,
    sourceImageUrl: image.signedUrl,
  }
}

export function useTraceDialogSession(sourceImage: TraceDialogSourceImage | null) {
  const [state, setState] = useState<TraceDialogState>({ phase: "idle" })
  const [error, setError] = useState("")

  const beginSelection = useCallback(() => {
    if (!sourceImage) {
      setError("No active image available for tracing.")
      return false
    }
    setError("")
    setState({ phase: "selecting", session: toSession(sourceImage) })
    return true
  }, [sourceImage])

  const closeSelection = useCallback(() => {
    setState({ phase: "idle" })
  }, [])

  const selectKind = useCallback((kind: TraceKind) => {
    setState((prev) => {
      if (prev.phase !== "selecting") return prev
      return { phase: "configuring", session: prev.session, kind }
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
    ]
  )
}
