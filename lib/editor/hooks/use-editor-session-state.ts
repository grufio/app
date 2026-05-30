"use client"

import { useMemo, useReducer } from "react"

export type EditorSidepanelTab = "image" | "filter" | "trace"

export type SessionState = {
  restoreOpen: boolean
  deleteOpen: boolean
  leftPanelTab: EditorSidepanelTab
  hiddenFilterIds: Record<string, true>
  /** Trace tab layer visibility — both default to true (everything
   * shown). Independent toggles because the SVG cells overlay and
   * the underlying canvas bitmap live in separate DOM layers; users
   * judge the trace by flipping one off at a time (only-cells view
   * vs. only-source view). Session-ephemeral, no persistence. */
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
}

export type SessionAction =
  | { type: "setRestoreOpen"; open: boolean }
  | { type: "setDeleteOpen"; open: boolean }
  | { type: "setLeftPanelTab"; tab: EditorSidepanelTab }
  | { type: "toggleHiddenFilter"; filterId: string }
  | { type: "showFilter"; filterId: string }
  | { type: "hideFilter"; filterId: string }
  | { type: "pruneHiddenFilters"; validIds: Set<string> }
  | { type: "setTraceOverlayVisible"; visible: boolean }
  | { type: "setPreviewBitmapVisible"; visible: boolean }

export function editorSessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "setRestoreOpen":
      if (state.restoreOpen === action.open) return state
      return { ...state, restoreOpen: action.open }
    case "setDeleteOpen":
      if (state.deleteOpen === action.open) return state
      return { ...state, deleteOpen: action.open }
    case "setLeftPanelTab":
      if (state.leftPanelTab === action.tab) return state
      return { ...state, leftPanelTab: action.tab }
    case "toggleHiddenFilter": {
      const next = { ...state.hiddenFilterIds }
      if (next[action.filterId]) delete next[action.filterId]
      else next[action.filterId] = true
      return { ...state, hiddenFilterIds: next }
    }
    case "showFilter": {
      if (!state.hiddenFilterIds[action.filterId]) return state
      const next = { ...state.hiddenFilterIds }
      delete next[action.filterId]
      return { ...state, hiddenFilterIds: next }
    }
    case "hideFilter": {
      if (state.hiddenFilterIds[action.filterId]) return state
      return { ...state, hiddenFilterIds: { ...state.hiddenFilterIds, [action.filterId]: true } }
    }
    case "pruneHiddenFilters": {
      let changed = false
      const next: Record<string, true> = {}
      for (const id of Object.keys(state.hiddenFilterIds)) {
        if (action.validIds.has(id)) next[id] = true
        else changed = true
      }
      if (!changed) return state
      return { ...state, hiddenFilterIds: next }
    }
    case "setTraceOverlayVisible":
      if (state.traceOverlayVisible === action.visible) return state
      return { ...state, traceOverlayVisible: action.visible }
    case "setPreviewBitmapVisible":
      if (state.previewBitmapVisible === action.visible) return state
      return { ...state, previewBitmapVisible: action.visible }
    default:
      return state
  }
}

export function useEditorSessionState() {
  const [state, dispatch] = useReducer(editorSessionReducer, {
    restoreOpen: false,
    deleteOpen: false,
    leftPanelTab: "image",
    hiddenFilterIds: {},
    traceOverlayVisible: true,
    previewBitmapVisible: true,
  })

  return useMemo(
    () => ({
      state,
      actions: {
        setRestoreOpen: (open: boolean) => dispatch({ type: "setRestoreOpen", open }),
        setDeleteOpen: (open: boolean) => dispatch({ type: "setDeleteOpen", open }),
        setLeftPanelTab: (tab: EditorSidepanelTab) => dispatch({ type: "setLeftPanelTab", tab }),
        toggleHiddenFilter: (filterId: string) => dispatch({ type: "toggleHiddenFilter", filterId }),
        showFilter: (filterId: string) => dispatch({ type: "showFilter", filterId }),
        hideFilter: (filterId: string) => dispatch({ type: "hideFilter", filterId }),
        pruneHiddenFilters: (validIds: Set<string>) => dispatch({ type: "pruneHiddenFilters", validIds }),
        setTraceOverlayVisible: (visible: boolean) => dispatch({ type: "setTraceOverlayVisible", visible }),
        setPreviewBitmapVisible: (visible: boolean) => dispatch({ type: "setPreviewBitmapVisible", visible }),
      },
    }),
    [state]
  )
}
