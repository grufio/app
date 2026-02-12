/**
 * Unit tests for selection handle placement math.
 */
import { describe, expect, it } from "vitest"

import { computeSelectionHandleRects, type BoundsRect, type ViewState } from "./selection-handles"

describe("computeSelectionHandleRects", () => {
  it("returns handle rects in world space", () => {
    const bounds: BoundsRect = { x: 0, y: 0, w: 100, h: 50 }
    const view: ViewState = { x: 0, y: 0, scale: 1 }
    const snap = (v: number) => v + 0.5
    const res = computeSelectionHandleRects({
      bounds,
      view,
      handlePx: 10,
      snapWorldToDeviceHalfPixel: (w) => snap(w),
    })

    expect(res.outline.x1).toBe(0.5)
    expect(res.outline.y2).toBe(50.5)
    expect(res.handleSize.w).toBe(10)
    expect(typeof res.handles.tl.x).toBe("number")
    expect(typeof res.handles.br.y).toBe("number")
  })
})

