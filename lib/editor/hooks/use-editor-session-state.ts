"use client"

import { useMemo, useReducer } from "react"

export type SessionState = {
  restoreOpen: boolean
  deleteOpen: boolean
  /** Trace tab layer visibility — both default to true (everything
   * shown). Independent toggles because the SVG cells overlay and
   * the underlying canvas bitmap live in separate DOM layers; users
   * judge the trace by flipping one off at a time (only-cells view
   * vs. only-source view). Session-ephemeral, no persistence. */
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
  /** Paint-by-numbers labels layer (the `<g id="numbers">` group inside
   * the trace SVG). Default true. Toggle is a pure CSS gate on the
   * inline-SVG host — the SVG bytes aren't regenerated. Old trace SVGs
   * (applied before the labels group existed) silently no-op the
   * toggle until they're re-applied. */
  numbersLayerVisible: boolean
}

export type SessionAction =
  | { type: "setRestoreOpen"; open: boolean }
  | { type: "setDeleteOpen"; open: boolean }
  | { type: "setTraceOverlayVisible"; visible: boolean }
  | { type: "setPreviewBitmapVisible"; visible: boolean }
  | { type: "setNumbersLayerVisible"; visible: boolean }

export function editorSessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "setRestoreOpen":
      if (state.restoreOpen === action.open) return state
      return { ...state, restoreOpen: action.open }
    case "setDeleteOpen":
      if (state.deleteOpen === action.open) return state
      return { ...state, deleteOpen: action.open }
    case "setTraceOverlayVisible":
      if (state.traceOverlayVisible === action.visible) return state
      return { ...state, traceOverlayVisible: action.visible }
    case "setPreviewBitmapVisible":
      if (state.previewBitmapVisible === action.visible) return state
      return { ...state, previewBitmapVisible: action.visible }
    case "setNumbersLayerVisible":
      if (state.numbersLayerVisible === action.visible) return state
      return { ...state, numbersLayerVisible: action.visible }
    default:
      return state
  }
}

export function useEditorSessionState() {
  const [state, dispatch] = useReducer(editorSessionReducer, {
    restoreOpen: false,
    deleteOpen: false,
    traceOverlayVisible: true,
    previewBitmapVisible: true,
    numbersLayerVisible: true,
  })

  return useMemo(
    () => ({
      state,
      actions: {
        setRestoreOpen: (open: boolean) => dispatch({ type: "setRestoreOpen", open }),
        setDeleteOpen: (open: boolean) => dispatch({ type: "setDeleteOpen", open }),
        setTraceOverlayVisible: (visible: boolean) => dispatch({ type: "setTraceOverlayVisible", visible }),
        setPreviewBitmapVisible: (visible: boolean) => dispatch({ type: "setPreviewBitmapVisible", visible }),
        setNumbersLayerVisible: (visible: boolean) => dispatch({ type: "setNumbersLayerVisible", visible }),
      },
    }),
    [state]
  )
}
