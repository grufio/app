/**
 * Unit tests for selection handle placement math.
 */
import { describe, expect, it } from "vitest"

import { computeSelectionHandleRects, type BoundsRect, type ViewState } from "./selection-handles"

describe("computeSelectionHandleRects", () => {
  it("returns outline and 8 handle rects in world space", () => {
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
    expect(typeof res.handles.tm.x).toBe("number")
    expect(typeof res.handles.rm.y).toBe("number")
    expect(typeof res.handles.br.y).toBe("number")
    expect(typeof res.handles.bm.x).toBe("number")
    expect(typeof res.handles.lm.y).toBe("number")
  })

  it("keeps handle size constant in device pixels across zoom", () => {
    const bounds: BoundsRect = { x: 10, y: 20, w: 100, h: 50 }
    const snap = (v: number) => v
    const res1 = computeSelectionHandleRects({
      bounds,
      view: { x: 0, y: 0, scale: 1 },
      handlePx: 8,
      snapWorldToDeviceHalfPixel: (w) => snap(w),
    })
    const res2 = computeSelectionHandleRects({
      bounds,
      view: { x: 123, y: 45, scale: 2.5 },
      handlePx: 8,
      snapWorldToDeviceHalfPixel: (w) => snap(w),
    })

    expect(res1.handleSize.w * 1).toBeCloseTo(8, 6)
    expect(res2.handleSize.w * 2.5).toBeCloseTo(8, 6)
  })

  it("places corner and edge-midpoint handles exactly on final outline points", () => {
    const bounds: BoundsRect = { x: 5, y: 10, w: 40, h: 20 }
    const view: ViewState = { x: 0, y: 0, scale: 1 }
    const handlePx = 10
    const res = computeSelectionHandleRects({
      bounds,
      view,
      handlePx,
      snapWorldToDeviceHalfPixel: (w) => w + 0.5,
    })
    const half = res.handleSize.w / 2
    const center = (p: { x: number; y: number }) => ({ x: p.x + half, y: p.y + half })
    const cTL = center(res.handles.tl)
    const cTM = center(res.handles.tm)
    const cTR = center(res.handles.tr)
    const cRM = center(res.handles.rm)
    const cBR = center(res.handles.br)
    const cBM = center(res.handles.bm)
    const cBL = center(res.handles.bl)
    const cLM = center(res.handles.lm)

    expect(cTL).toEqual({ x: res.outline.x1, y: res.outline.y1 })
    expect(cTM).toEqual({ x: (res.outline.x1 + res.outline.x2) / 2, y: res.outline.y1 })
    expect(cTR).toEqual({ x: res.outline.x2, y: res.outline.y1 })
    expect(cRM).toEqual({ x: res.outline.x2, y: (res.outline.y1 + res.outline.y2) / 2 })
    expect(cBR).toEqual({ x: res.outline.x2, y: res.outline.y2 })
    expect(cBM).toEqual({ x: (res.outline.x1 + res.outline.x2) / 2, y: res.outline.y2 })
    expect(cBL).toEqual({ x: res.outline.x1, y: res.outline.y2 })
    expect(cLM).toEqual({ x: res.outline.x1, y: (res.outline.y1 + res.outline.y2) / 2 })
  })
})

