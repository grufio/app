"use client"

/**
 * Shell-scope UI state for the canvas-first editor section model.
 *
 * Owns:
 *   - `gridVisible` (rendered overlay toggle)
 *   - `selectedNavId` (image/crop selection — read by the stage
 *     interaction policy; the crop tool auto-sets it)
 *   - `editorSection` (the active editor section, both viewports)
 *   - `pendingTraceKindOpen` (cross-mount trace-kind open channel)
 *   - `pendingArtboardDialog` (cross-mount artboard-dialog open channel)
 *
 * Plus the callback wrappers (`handleSectionTap`,
 * `consumePendingTraceKindOpen`) so the shell can pass references
 * straight through instead of inlining them.
 */
import { useCallback, useState } from "react"

import { buildNavId } from "@/features/editor/navigation/nav-id"
import type { ArtboardDialog, EditorSection } from "@/lib/editor/editor-sections"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export function usePanelUIState() {
  const [gridVisible, setGridVisible] = useState(true)
  const [selectedNavId, setSelectedNavId] = useState<string>(() =>
    buildNavId({ kind: "artboard" }),
  )
  const [editorSection, setEditorSection] = useState<EditorSection>("artboard")
  // Cross-mount channel: the EditorTopLeftBar trace sub-pill sets a
  // pending kind when the user picks Pixelate / Circulate / Lineart
  // from outside the trace surface. The TraceSurfaceScope reads it on
  // mount (mobile) or next render (desktop, always mounted) and opens
  // the matching configure dialog, then clears via the consume cb.
  const [pendingTraceKindOpen, setPendingTraceKindOpen] = useState<RegisteredTraceId | null>(null)
  // Cross-mount channel: the EditorTopLeftBar artboard sub-pill sets which of
  // the three standalone dialogs (Artboard / Grid / Image) to open — local to
  // ArtboardSurfaceScope's `activeDialog`. The scope reads it on render, opens
  // the matching sheet, then clears it via consume so leaving/re-entering the
  // section doesn't re-pop it.
  const [pendingArtboardDialog, setPendingArtboardDialog] = useState<ArtboardDialog | null>(null)

  const handleSectionTap = useCallback((section: EditorSection) => {
    setEditorSection(section)
  }, [])

  const consumePendingTraceKindOpen = useCallback(() => {
    setPendingTraceKindOpen(null)
  }, [])

  const consumePendingArtboardDialog = useCallback(() => {
    setPendingArtboardDialog(null)
  }, [])

  return {
    gridVisible,
    setGridVisible,
    selectedNavId,
    setSelectedNavId,
    editorSection,
    setEditorSection,
    handleSectionTap,
    pendingTraceKindOpen,
    setPendingTraceKindOpen,
    consumePendingTraceKindOpen,
    pendingArtboardDialog,
    setPendingArtboardDialog,
    consumePendingArtboardDialog,
  }
}
