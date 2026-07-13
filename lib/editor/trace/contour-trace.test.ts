import { describe, expect, it } from "vitest"

import { chaikinClosed, traceRegionContours } from "./contour-trace"

// bounding box of a loop
function bbox(loop: number[][]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of loop) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

describe("traceRegionContours", () => {
  it("traces a solid single-region grid as its bounding rectangle", () => {
    const w = 3
    const h = 3
    const labels = new Int32Array(w * h) // all region 0
    const [c] = traceRegionContours(labels, w, h, 1)
    expect(c.region).toBe(0)
    expect(c.area).toBe(9)
    expect(bbox(c.loop)).toEqual({ minX: 0, minY: 0, maxX: 3, maxY: 3 })
    expect(c.loop.length).toBe(12) // 12 unit edges around a 3×3 block
  })

  it("splits two regions and returns them area-descending", () => {
    // left column (region 0, 1×3) | right 2 cols (region 1, 2×3)
    const w = 3
    const h = 3
    const labels = new Int32Array(w * h)
    for (let y = 0; y < h; y += 1) {
      labels[y * w + 1] = 1
      labels[y * w + 2] = 1
    }
    const cs = traceRegionContours(labels, w, h, 2)
    expect(cs.map((c) => c.region)).toEqual([1, 0]) // region 1 (area 6) first
    expect(cs[0].area).toBe(6)
    expect(cs[1].area).toBe(3)
    // region 0 occupies x∈[0,1], region 1 x∈[1,3]; they share the x=1 seam.
    expect(bbox(cs[1].loop)).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 3 })
    expect(bbox(cs[0].loop)).toEqual({ minX: 1, minY: 0, maxX: 3, maxY: 3 })
  })

  it("traces the OUTER contour of a region that encloses another", () => {
    // 5×5 region 0 with region 1 as a single centre pixel (a hole in 0).
    const w = 5
    const h = 5
    const labels = new Int32Array(w * h)
    labels[2 * w + 2] = 1
    const cs = traceRegionContours(labels, w, h, 2)
    const r0 = cs.find((c) => c.region === 0)!
    const r1 = cs.find((c) => c.region === 1)!
    // region 0's OUTER loop is the 5×5 frame (the hole is region 1's own outer loop)
    expect(bbox(r0.loop)).toEqual({ minX: 0, minY: 0, maxX: 5, maxY: 5 })
    // region 1's loop is the centre unit square
    expect(bbox(r1.loop)).toEqual({ minX: 2, minY: 2, maxX: 3, maxY: 3 })
    expect(r1.loop.length).toBe(4)
  })

  it("skips empty region ids", () => {
    const labels = new Int32Array(4) // all 0; region 1 unused
    const cs = traceRegionContours(labels, 2, 2, 2)
    expect(cs.length).toBe(1)
    expect(cs[0].region).toBe(0)
  })
})

describe("chaikinClosed", () => {
  it("doubles the point count per iteration and stays within the hull", () => {
    const square = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ]
    const sm = chaikinClosed(square, 2)
    expect(sm.length).toBe(square.length * 4)
    for (const [x, y] of sm) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(4)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(4)
    }
  })

  it("rounds corners — the smoothed square is no longer axis-aligned at the corner", () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const sm = chaikinClosed(square, 1)
    // the sharp (0,0) corner is replaced by two cut points, none exactly at (0,0)
    expect(sm.some(([x, y]) => x === 0 && y === 0)).toBe(false)
  })
})
