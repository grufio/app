"use client"

import type { ViewState } from "./types"

export function clientToWorldPoint(args: {
  clientX: number
  clientY: number
  containerRect: DOMRect
  view: ViewState
}): { worldX: number; worldY: number } {
  const { clientX, clientY, containerRect, view } = args
  const stageX = clientX - containerRect.left
  const stageY = clientY - containerRect.top
  const worldX = (stageX - view.x) / Math.max(1e-6, view.scale)
  const worldY = (stageY - view.y) / Math.max(1e-6, view.scale)
  return { worldX, worldY }
}

