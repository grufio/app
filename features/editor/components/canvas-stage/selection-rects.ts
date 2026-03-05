"use client"

import { computeSelectionHandleRects } from "@/services/editor"

type BoundsFrame = { x: number; y: number; w: number; h: number } | null

export function computeSelectionRects(args: {
  frame: BoundsFrame
  view: { x: number; y: number; scale: number }
  handlePx: number
  snapWorldToDeviceHalfPixel: (coord: number, axis: "x" | "y") => number
}) {
  const { frame, view, handlePx, snapWorldToDeviceHalfPixel } = args
  if (!frame) return null
  return computeSelectionHandleRects({
    bounds: frame,
    view,
    handlePx,
    snapWorldToDeviceHalfPixel,
  })
}
