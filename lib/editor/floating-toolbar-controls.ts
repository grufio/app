"use client"

/**
 * Floating toolbar state + shortcut bindings.
 *
 * Responsibilities:
 * - Manage tool selection (select/hand) and map actions to canvas imperative API.
 * - Optionally bind keyboard shortcuts when enabled.
 */
import { useCallback, useEffect, useMemo, useState } from "react"

import type { ProjectCanvasStageHandle } from "@/features/editor"

export type EditorTool = "select" | "hand"

export type FloatingToolbarActions = {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  rotate: () => void
}

export type FloatingToolbarControls = {
  tool: EditorTool
  setTool: (tool: EditorTool) => void
  panEnabled: boolean
  imageDraggable: boolean
  actionsDisabled: boolean
  actions: FloatingToolbarActions
}

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null
  if (!n) return false
  const tag = n.tagName?.toLowerCase()
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  return Boolean(n.isContentEditable)
}

export function useFloatingToolbarControls(opts: {
  canvasRef: React.RefObject<ProjectCanvasStageHandle | null>
  hasImage: boolean
  masterImageLoading: boolean
  imageStateLoading: boolean
  enableShortcuts?: boolean
}): FloatingToolbarControls {
  const { canvasRef, hasImage, masterImageLoading, imageStateLoading, enableShortcuts = false } = opts

  const [tool, setTool] = useState<EditorTool>("hand")
  const panEnabled = tool === "hand"
  const imageDraggable = tool === "select"

  const actionsDisabled = !hasImage || masterImageLoading || imageStateLoading

  const zoomIn = useCallback(() => canvasRef.current?.zoomIn(), [canvasRef])
  const zoomOut = useCallback(() => canvasRef.current?.zoomOut(), [canvasRef])
  const fit = useCallback(() => canvasRef.current?.fitToView(), [canvasRef])
  const rotate = useCallback(() => canvasRef.current?.rotate90(), [canvasRef])

  useEffect(() => {
    if (!enableShortcuts) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (isTypingTarget(e.target)) return

      const k = e.key.toLowerCase()
      if (k === "v") {
        e.preventDefault()
        setTool("select")
        return
      }
      if (k === "h") {
        e.preventDefault()
        setTool("hand")
        return
      }
      if (actionsDisabled) return

      if (k === "0") {
        e.preventDefault()
        fit()
        return
      }
      if (k === "+" || k === "=") {
        e.preventDefault()
        zoomIn()
        return
      }
      if (k === "-") {
        e.preventDefault()
        zoomOut()
        return
      }
      if (k === "r") {
        e.preventDefault()
        rotate()
        return
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [actionsDisabled, enableShortcuts, fit, rotate, zoomIn, zoomOut])

  const actions = useMemo<FloatingToolbarActions>(() => ({ zoomIn, zoomOut, fit, rotate }), [fit, rotate, zoomIn, zoomOut])

  return useMemo(
    () => ({ tool, setTool, panEnabled, imageDraggable, actionsDisabled, actions }),
    [actions, actionsDisabled, imageDraggable, panEnabled, tool]
  )
}

