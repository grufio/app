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
  handles: { tl: { x: number; y: number }; tr: { x: number; y: number }; br: { x: number; y: number }; bl: { x: number; y: number } }
  handleSize: { w: number; h: number }
} {
  const { bounds, view, handlePx, snapWorldToDeviceHalfPixel } = opts
  const x1 = snapWorldToDeviceHalfPixel(bounds.x, "x")
  const y1 = snapWorldToDeviceHalfPixel(bounds.y, "y")
  const x2 = snapWorldToDeviceHalfPixel(bounds.x + bounds.w, "x")
  const y2 = snapWorldToDeviceHalfPixel(bounds.y + bounds.h, "y")

  const toWorldFromScreen = (screen: number, axis: "x" | "y") => {
    const offset = axis === "x" ? view.x : view.y
    const scale = view.scale || 1
    return (screen - offset) / scale
  }

  const handleAt = (screenX: number, screenY: number) => {
    const left = Math.round(screenX - handlePx / 2)
    const top = Math.round(screenY - handlePx / 2)
    return { x: toWorldFromScreen(left, "x"), y: toWorldFromScreen(top, "y") }
  }

  const cornerTL = { x: view.x + x1 * view.scale, y: view.y + y1 * view.scale }
  const cornerTR = { x: view.x + x2 * view.scale, y: view.y + y1 * view.scale }
  const cornerBR = { x: view.x + x2 * view.scale, y: view.y + y2 * view.scale }
  const cornerBL = { x: view.x + x1 * view.scale, y: view.y + y2 * view.scale }

  return {
    outline: { x1, y1, x2, y2 },
    handles: {
      tl: handleAt(cornerTL.x, cornerTL.y),
      tr: handleAt(cornerTR.x, cornerTR.y),
      br: handleAt(cornerBR.x, cornerBR.y),
      bl: handleAt(cornerBL.x, cornerBL.y),
    },
    handleSize: { w: handlePx, h: handlePx },
  }
}

