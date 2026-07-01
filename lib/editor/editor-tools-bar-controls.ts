"use client"

/**
 * Floating toolbar state + shortcut bindings.
 *
 * Tool roles (Illustrator-style):
 *   object — filled arrow. Acts on the whole image (drag, resize). Default
 *            on every tab.
 *   direct — outlined arrow. Acts on trace-overlay regions (click to
 *            highlight). Only meaningful on the Trace tab.
 *   hand   — pans the artboard view; never touches image or trace.
 *   crop   — crops the image bounds. Only on Image tab.
 *
 * Default tool = object. Hand stays explicit user choice.
 */
import { useCallback, useEffect, useMemo, useState } from "react"

import type { ProjectCanvasStageHandle } from "@/features/editor"

export type EditorTool = "object" | "direct" | "hand" | "crop"

export type EditorToolsBarActions = {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  rotate: () => void
}

export type EditorToolsBarControls = {
  tool: EditorTool
  setTool: (tool: EditorTool) => void
  panEnabled: boolean
  imageDraggable: boolean
  actionsDisabled: boolean
  actions: EditorToolsBarActions
}

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null
  if (!n) return false
  const tag = n.tagName?.toLowerCase()
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  return Boolean(n.isContentEditable)
}

export function useEditorToolsBarControls(opts: {
  canvasRef: React.RefObject<ProjectCanvasStageHandle | null>
  hasImage: boolean
  masterImageLoading: boolean
  enableShortcuts?: boolean
}): EditorToolsBarControls {
  const { canvasRef, hasImage, masterImageLoading, enableShortcuts = false } = opts

  const [tool, setTool] = useState<EditorTool>("object")
  const panEnabled = tool === "hand"
  const imageDraggable = tool === "object"

  const actionsDisabled = !hasImage || masterImageLoading

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
        setTool("object")
        return
      }
      if (k === "a") {
        e.preventDefault()
        setTool("direct")
        return
      }
      if (k === "h") {
        e.preventDefault()
        setTool("hand")
        return
      }
      if (k === "c") {
        e.preventDefault()
        setTool("crop")
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

  const actions = useMemo<EditorToolsBarActions>(() => ({ zoomIn, zoomOut, fit, rotate }), [fit, rotate, zoomIn, zoomOut])

  return useMemo(
    () => ({ tool, setTool, panEnabled, imageDraggable, actionsDisabled, actions }),
    [actions, actionsDisabled, imageDraggable, panEnabled, tool]
  )
}
