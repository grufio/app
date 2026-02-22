/**
 * Editor service: selection handle placement (UI-agnostic).
 *
 * Responsibilities:
 * - Convert an axis-aligned bounds rect into world-space rectangles for constant-pixel handles.
 * - Keep the math isolated from Konva/React rendering concerns.
 */
export type BoundsRect = { x: number; y: number; w: number; h: number }
export type ViewState = { x: number; y: number; scale: number }

export function computeSelectionHandleRects(opts: {
  bounds: BoundsRect
  view: ViewState
  handlePx: number
  snapWorldToDeviceHalfPixel: (worldCoord: number, axis: "x" | "y") => number
}): {
  outline: { x1: number; y1: number; x2: number; y2: number }
  handles: {
    tl: { x: number; y: number }
    tm: { x: number; y: number }
    tr: { x: number; y: number }
    rm: { x: number; y: number }
    br: { x: number; y: number }
    bm: { x: number; y: number }
    bl: { x: number; y: number }
    lm: { x: number; y: number }
  }
  handleSize: { w: number; h: number }
} {
  const { bounds, view, handlePx, snapWorldToDeviceHalfPixel } = opts
  const x1 = snapWorldToDeviceHalfPixel(bounds.x, "x")
  const y1 = snapWorldToDeviceHalfPixel(bounds.y, "y")
  const x2 = snapWorldToDeviceHalfPixel(bounds.x + bounds.w, "x")
  const y2 = snapWorldToDeviceHalfPixel(bounds.y + bounds.h, "y")
  const xMid = (x1 + x2) / 2
  const yMid = (y1 + y2) / 2
  const scale = Math.max(0.000001, Math.abs(view.scale || 1))
  // Keep handles device-size stable across zoom by converting px -> world units.
  const handleWorld = handlePx / scale

  const handleAt = (centerX: number, centerY: number) => {
    return { x: centerX - handleWorld / 2, y: centerY - handleWorld / 2 }
  }

  return {
    outline: { x1, y1, x2, y2 },
    handles: {
      tl: handleAt(x1, y1),
      tm: handleAt(xMid, y1),
      tr: handleAt(x2, y1),
      rm: handleAt(x2, yMid),
      br: handleAt(x2, y2),
      bm: handleAt(xMid, y2),
      bl: handleAt(x1, y2),
      lm: handleAt(x1, yMid),
    },
    handleSize: { w: handleWorld, h: handleWorld },
  }
}

