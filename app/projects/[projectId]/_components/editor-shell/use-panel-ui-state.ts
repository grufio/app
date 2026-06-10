"use client"

/**
 * Shell-scope UI state that drives panel visibility + the
 * desktop/mobile section split.
 *
 * Owns:
 *   - `gridVisible` (rendered overlay toggle)
 *   - `selectedNavId` (left-panel nav-tree selection)
 *   - `mobileSection` (bottom-nav active section)
 *   - `leftPanelOpen` / `rightPanelOpen` (mobile drawers)
 *
 * Plus the callback wrappers (`handleMobileNavTap`,
 * `handleToggleLeftPanel`, `handleToggleRightPanel`,
 * `closeLeftPanelOnTraceSelection`) so the shell can pass references
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
  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
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

  const handleToggleLeftPanel = useCallback(() => {
    setLeftPanelOpen((open) => !open)
  }, [])

  const handleToggleRightPanel = useCallback(() => {
    setRightPanelOpen((open) => !open)
  }, [])

  // Mobile-only effect: trace selection is reached via the left-panel
  // Sheet drawer; closing it before opening the dialog lands every
  // exit path in a clean editor. Desktop never opens the sheet so
  // this is a no-op there.
  const closeLeftPanelOnTraceSelection = useCallback(() => {
    setLeftPanelOpen(false)
  }, [])

  return {
    gridVisible,
    setGridVisible,
    selectedNavId,
    setSelectedNavId,
    mobileSection,
    setMobileSection,
    handleMobileNavTap,
    leftPanelOpen,
    setLeftPanelOpen,
    handleToggleLeftPanel,
    rightPanelOpen,
    setRightPanelOpen,
    handleToggleRightPanel,
    closeLeftPanelOnTraceSelection,
    pendingTraceKindOpen,
    setPendingTraceKindOpen,
    consumePendingTraceKindOpen,
  }
}
