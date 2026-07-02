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
  // Cross-mount channel: the EditorFuncsBar trace sub-pill sets a
  // pending kind when the user picks Pixelate / Circulate / Lineart
  // from outside the trace surface. The TraceSurfaceScope reads it on
  // mount and opens the matching configure dialog, then clears via the
  // consume cb.
  const [pendingTraceKindOpen, setPendingTraceKindOpen] = useState<RegisteredTraceId | null>(null)
  // Cross-mount channel: the trace top-right bar's "+" asks TraceSurfaceScope to
  // open the kind PICKER (selection). Boolean — unlike `pendingTraceKindOpen` it
  // doesn't target a specific kind (that one skips the picker → configure).
  const [pendingTraceSelectionOpen, setPendingTraceSelectionOpen] = useState(false)
  // Cross-mount channel: the EditorFuncsBar artboard sub-pill sets which of
  // the three standalone dialogs (Artboard / Grid / Image) to open — local to
  // ArtboardSurfaceScope's `activeDialog`. The scope reads it on render, opens
  // the matching sheet, then clears it via consume so leaving/re-entering the
  // section doesn't re-pop it.
  const [pendingArtboardDialog, setPendingArtboardDialog] = useState<ArtboardDialog | null>(null)
  // The Image action is its own context inside the artboard section: tapping it
  // swaps the top-right bar from the Artboard/Grid submenu to a single Image
  // icon (add / edit). Tapping any section resets it back to the artboard bar.
  const [imageBarActive, setImageBarActive] = useState(false)

  const handleSectionTap = useCallback((section: EditorSection) => {
    setEditorSection(section)
    setImageBarActive(false)
  }, [])

  const consumePendingTraceKindOpen = useCallback(() => {
    setPendingTraceKindOpen(null)
  }, [])

  const consumePendingTraceSelectionOpen = useCallback(() => {
    setPendingTraceSelectionOpen(false)
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
    pendingTraceSelectionOpen,
    setPendingTraceSelectionOpen,
    consumePendingTraceSelectionOpen,
    pendingArtboardDialog,
    setPendingArtboardDialog,
    consumePendingArtboardDialog,
    imageBarActive,
    setImageBarActive,
  }
}
