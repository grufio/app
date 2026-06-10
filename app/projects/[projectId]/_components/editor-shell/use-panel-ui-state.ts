"use client"

/**
 * Shell-scope UI state for the canvas-first editor section model.
 *
 * Owns:
 *   - `gridVisible` (rendered overlay toggle)
 *   - `selectedNavId` (image/crop selection — read by the stage
 *     interaction policy; the crop tool auto-sets it)
 *   - `mobileSection` (the active editor section, both viewports)
 *   - `pendingTraceKindOpen` (cross-mount trace-kind open channel)
 *
 * Plus the callback wrappers (`handleMobileNavTap`,
 * `consumePendingTraceKindOpen`) so the shell can pass references
 * straight through instead of inlining them.
 */
import { useCallback, useState } from "react"

import { buildNavId } from "@/features/editor/navigation/nav-id"
import type { MobileSection } from "@/lib/editor/mobile-sections"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export function usePanelUIState() {
  const [gridVisible, setGridVisible] = useState(true)
  const [selectedNavId, setSelectedNavId] = useState<string>(() =>
    buildNavId({ kind: "artboard" }),
  )
  const [mobileSection, setMobileSection] = useState<MobileSection>("artboard")
  // Cross-mount channel: the EditorTopLeftBar trace sub-pill sets a
  // pending kind when the user picks Pixelate / Circulate / Lineart
  // from outside the trace surface. The TraceSurfaceScope reads it on
  // mount (mobile) or next render (desktop, always mounted) and opens
  // the matching configure dialog, then clears via the consume cb.
  const [pendingTraceKindOpen, setPendingTraceKindOpen] = useState<RegisteredTraceId | null>(null)

  const handleMobileNavTap = useCallback((section: MobileSection) => {
    setMobileSection(section)
  }, [])

  const consumePendingTraceKindOpen = useCallback(() => {
    setPendingTraceKindOpen(null)
  }, [])

  return {
    gridVisible,
    setGridVisible,
    selectedNavId,
    setSelectedNavId,
    mobileSection,
    setMobileSection,
    handleMobileNavTap,
    pendingTraceKindOpen,
    setPendingTraceKindOpen,
    consumePendingTraceKindOpen,
  }
}
