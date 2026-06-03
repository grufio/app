"use client"

/**
 * Per-side draggable panel width state (desktop only — mobile uses a
 * Sheet at full width). Defaults the user can override by dragging
 * the panel resizer; the panels themselves clamp to
 * `[minPanelRem, maxPanelRem]`. Initial 20rem keeps both panels at
 * the same starting width.
 */
import { useState } from "react"

export type PanelSizing = {
  leftPanelWidthRem: number
  setLeftPanelWidthRem: (value: number) => void
  rightPanelWidthRem: number
  setRightPanelWidthRem: (value: number) => void
  minPanelRem: number
  maxPanelRem: number
}

export function usePanelSizing(): PanelSizing {
  const [leftPanelWidthRem, setLeftPanelWidthRem] = useState(20)
  const [rightPanelWidthRem, setRightPanelWidthRem] = useState(20)
  return {
    leftPanelWidthRem,
    setLeftPanelWidthRem,
    rightPanelWidthRem,
    setRightPanelWidthRem,
    minPanelRem: 18,
    maxPanelRem: 24,
  }
}
