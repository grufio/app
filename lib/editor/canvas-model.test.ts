/**
 * Unit tests for `lib/editor/canvas-model.ts`.
 *
 * Focus:
 * - Fit/pan/zoom math remains correct and deterministic.
 */
import { describe, expect, it } from "vitest"

import { fitToWorld, panBy, zoomAround } from "./canvas-model"

describe("canvas-model", () => {
  it("fitToWorld centers world", () => {
    const view = fitToWorld({ w: 1000, h: 500 }, { w: 500, h: 500 })
    expect(view.scale).toBeCloseTo(1)
    expect(view.x).toBeCloseTo(250)
    expect(view.y).toBeCloseTo(0)
  })

  it("fitToWorld supports padding", () => {
    const view = fitToWorld({ w: 1000, h: 500 }, { w: 500, h: 500 }, 32)
    // Height is limiting (500-64 = 436): scale = 436/500 = 0.872
    // x centered within padded box: (936-436)/2 + 32 = 282
    expect(view.scale).toBeCloseTo(0.872)
    expect(view.x).toBeCloseTo(282)
    expect(view.y).toBeCloseTo(32)
  })

  it("panBy applies deltas in screen space", () => {
    const v = panBy({ scale: 1, x: 10, y: 20 }, 5, -5)
    expect(v.x).toBe(5)
    expect(v.y).toBe(25)
  })

  it("zoomAround keeps pointer stable in world space", () => {
    const pointer = { x: 200, y: 100 }
    const v1 = { scale: 1, x: 0, y: 0 }
    const v2 = zoomAround(v1, pointer, 2)
    // The world coordinate under pointer should be the same pre/post zoom:
    const world1 = { x: (pointer.x - v1.x) / v1.scale, y: (pointer.y - v1.y) / v1.scale }
    const world2 = { x: (pointer.x - v2.x) / v2.scale, y: (pointer.y - v2.y) / v2.scale }
    expect(world2.x).toBeCloseTo(world1.x)
    expect(world2.y).toBeCloseTo(world1.y)
  })

  it("zoomAround clamps scale to min/max", () => {
    const pointer = { x: 0, y: 0 }
    const v1 = { scale: 1, x: 0, y: 0 }
    const vMin = zoomAround(v1, pointer, 0.000001, 0.5, 2)
    expect(vMin.scale).toBeCloseTo(0.5)
    const vMax = zoomAround(v1, pointer, 1000, 0.5, 2)
    expect(vMax.scale).toBeCloseTo(2)
  })
})

