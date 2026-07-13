import { describe, expect, it } from "vitest"

import { assembleFaces, buildArcs, smoothArc } from "./boundary-arcs"

// left `splitX` columns = region 0, the rest = region 1.
function splitLabels(w: number, h: number, splitX: number): Int32Array {
  const l = new Int32Array(w * h)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) l[y * w + x] = x < splitX ? 0 : 1
  return l
}

function smoothAll(g: ReturnType<typeof buildArcs>, eps = 1, iters = 3): void {
  for (const arc of g.arcs) arc.smooth = smoothArc(arc.corners, g.cornerStride, eps, iters)
}

describe("buildArcs", () => {
  it("adjacent regions SHARE exactly one arc (watertight core)", () => {
    const g = buildArcs(splitLabels(3, 3, 1), 3, 3)
    const shared = g.arcs
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => a.labels.includes(0) && a.labels.includes(1))
    expect(shared.length).toBe(1)
    const idx = shared[0].i
    expect(g.regionArcs.get(0)).toContain(idx)
    expect(g.regionArcs.get(1)).toContain(idx)
  })

  it("border arcs carry a -1 (outside) label", () => {
    const g = buildArcs(splitLabels(3, 3, 1), 3, 3)
    const r0 = (g.regionArcs.get(0) ?? []).map((i) => g.arcs[i])
    expect(r0.some((a) => a.labels.includes(-1))).toBe(true)
  })

  it("forces the 4 image corners as junctions → a solid region has 4 straight frame arcs, not one loop", () => {
    const g = buildArcs(new Int32Array(9), 3, 3) // solid region 0
    const r0 = g.regionArcs.get(0) ?? []
    expect(r0.length).toBe(4)
    smoothAll(g)
    // each frame arc is a straight border run (constant x or constant y)
    for (const i of r0) {
      const s = g.arcs[i].smooth
      const constX = s.every((p) => p[0] === s[0][0])
      const constY = s.every((p) => p[1] === s[0][1])
      expect(constX || constY).toBe(true)
    }
  })

  it("an enclosed region's boundary is a pure closed-loop arc (second trace pass)", () => {
    const l = new Int32Array(25) // 5×5 region 0
    l[2 * 5 + 2] = 1 // centre pixel region 1
    const g = buildArcs(l, 5, 5)
    const shared = g.arcs.filter((a) => a.labels.includes(0) && a.labels.includes(1))
    expect(shared.length).toBe(1)
    expect(shared[0].corners[0]).toBe(shared[0].corners[shared[0].corners.length - 1]) // closed
  })
})

describe("smoothArc", () => {
  it("is direction-symmetric: reverse(smooth(c)) ≈ smooth(reverse(c)) — the watertight guarantee", () => {
    const g = buildArcs(splitLabels(6, 5, 3), 6, 5)
    const arc = g.arcs.find((a) => a.labels.includes(0) && a.labels.includes(1))!
    const fwd = smoothArc(arc.corners, g.cornerStride, 1, 3)
    const rev = smoothArc([...arc.corners].reverse(), g.cornerStride, 1, 3)
    const revBack = [...rev].reverse()
    expect(fwd.length).toBe(revBack.length)
    for (let i = 0; i < fwd.length; i += 1) {
      expect(fwd[i][0]).toBeCloseTo(revBack[i][0], 9)
      expect(fwd[i][1]).toBeCloseTo(revBack[i][1], 9)
    }
  })

  it("keeps a colinear border arc perfectly straight", () => {
    // corners along y=0: (0,0),(1,0),(2,0),(3,0) with S=(h+1)
    const S = 5
    const corners = [0 * S + 0, 1 * S + 0, 2 * S + 0, 3 * S + 0]
    const s = smoothArc(corners, S, 1, 4)
    expect(s.every((p) => p[1] === 0)).toBe(true)
    expect(s[0]).toEqual([0, 0])
    expect(s[s.length - 1]).toEqual([3, 0])
  })
})

describe("assembleFaces", () => {
  it("returns 2 loops for a region with a hole, 1 for the enclosed region", () => {
    const l = new Int32Array(25)
    l[2 * 5 + 2] = 1
    const g = buildArcs(l, 5, 5)
    smoothAll(g)
    expect(assembleFaces(g.arcs, g.regionArcs, 0).length).toBe(2) // outer frame + hole
    expect(assembleFaces(g.arcs, g.regionArcs, 1).length).toBe(1)
  })

  it("stitches each region into a closed loop; the shared seam is identical (reversed) for both", () => {
    const g = buildArcs(splitLabels(4, 3, 2), 4, 3)
    smoothAll(g)
    const f0 = assembleFaces(g.arcs, g.regionArcs, 0)
    const f1 = assembleFaces(g.arcs, g.regionArcs, 1)
    expect(f0.length).toBe(1)
    expect(f1.length).toBe(1)
    // the shared arc's smoothed points appear in both faces
    const seam = g.arcs.find((a) => a.labels.includes(0) && a.labels.includes(1))!.smooth
    const inFace = (face: number[][][], pts: number[][]): boolean =>
      face.some((loop) => {
        const key = (p: number[]) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`
        const set = new Set(loop.map(key))
        return pts.every((p) => set.has(key(p)))
      })
    expect(inFace(f0, seam)).toBe(true)
    expect(inFace(f1, seam)).toBe(true)
  })
})
