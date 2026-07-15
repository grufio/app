import { describe, expect, it } from "vitest"

import { rgb255ToOklab, type Oklab } from "@/lib/color/oklab"

import {
  LINERATE_DETAIL_MAX_FRAC,
  LINERATE_DETAIL_MIN_FRAC,
  chipPerCluster,
  connectedComponents,
  detailToMinArea,
  renderRegionsRgba,
  segmentRegions,
} from "./linerate-preview"
import type { PaletteChip } from "./trace-cell-colors"

// Distinct chip OKLab colours for merge-distance math in the segmentation tests.
const CHIP_OKLAB: Oklab[] = [
  rgb255ToOklab(200, 60, 60),
  rgb255ToOklab(60, 200, 60),
  rgb255ToOklab(60, 60, 200),
  rgb255ToOklab(210, 210, 210),
]

describe("detailToMinArea", () => {
  it("shrinks strictly as detail rises (more, finer facets)", () => {
    const px = 384 * 288
    const areas = [0, 0.25, 0.5, 0.75, 1].map((d) => detailToMinArea(d, px, 0))
    for (let i = 1; i < areas.length; i += 1) expect(areas[i]).toBeLessThan(areas[i - 1])
  })

  it("is geometric — equal detail steps scale min-area by ~constant ratio", () => {
    const px = 384 * 288
    const areas = [0, 0.25, 0.5, 0.75, 1].map((d) => detailToMinArea(d, px, 0))
    const ratios = areas.slice(0, -1).map((a, i) => a / areas[i + 1])
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(1.05)
  })

  it("never drops below the paintability floor (π·minRadius²)", () => {
    // Tiny image so frac·px < floor and the floor wins.
    const floor = Math.PI * 6 * 6
    expect(detailToMinArea(1, 100, 6)).toBeCloseTo(floor, 6)
  })

  it("uses the server geometric formula at the endpoints", () => {
    const px = 1_000_000
    expect(detailToMinArea(0, px, 0)).toBeCloseTo(LINERATE_DETAIL_MAX_FRAC * px, 6)
    expect(detailToMinArea(1, px, 0)).toBeCloseTo(LINERATE_DETAIL_MIN_FRAC * px, 6)
  })
})

describe("connectedComponents", () => {
  it("splits two colour halves into exactly two regions with correct areas", () => {
    // 4x2, left half paint 0, right half paint 1.
    const w = 4
    const h = 2
    const paint = new Int32Array(w * h)
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) paint[y * w + x] = x < 2 ? 0 : 1
    const cc = connectedComponents(paint, w, h)
    expect(cc.regionCount).toBe(2)
    expect([...cc.regionArea].sort()).toEqual([4, 4])
  })

  it("is 4-connected — a diagonal-only checkerboard stays separate components", () => {
    const w = 2
    const h = 2
    // 0 1 / 1 0 : each cell touches its same-colour diagonal only → 4 regions.
    const paint = Int32Array.from([0, 1, 1, 0])
    expect(connectedComponents(paint, w, h).regionCount).toBe(4)
  })

  it("collapses a solid image to one region", () => {
    const paint = new Int32Array(5 * 5) // all 0
    expect(connectedComponents(paint, 5, 5).regionCount).toBe(1)
  })
})

describe("chipPerCluster", () => {
  it("maps two centroids that snap to the same chip onto one chip index", () => {
    const mkChip = (r: number, g: number, b: number): PaletteChip => ({
      oklab: rgb255ToOklab(r, g, b),
      rgb: [r, g, b],
      notation: `${r}-${g}-${b}`,
      color_name: null,
    })
    const palette: PaletteChip[] = [mkChip(255, 0, 0), mkChip(0, 0, 255)]
    // Two near-red centroids + one near-blue.
    const centroids: Oklab[] = [rgb255ToOklab(250, 10, 10), rgb255ToOklab(240, 20, 20), rgb255ToOklab(10, 10, 250)]
    const chip = chipPerCluster(centroids, palette)
    expect(chip[0]).toBe(chip[1]) // both reds → same chip
    expect(chip[2]).not.toBe(chip[0]) // blue → different chip
  })

  it("with an empty palette each cluster is its own paint", () => {
    const chip = chipPerCluster([rgb255ToOklab(1, 2, 3), rgb255ToOklab(4, 5, 6)], [])
    expect([...chip]).toEqual([0, 1])
  })
})

describe("segmentRegions", () => {
  it("absorbs a sub-min-area sliver between two large facets", () => {
    // 15 wide: a 1px paint-2 sliver splitting a big paint-0 left from paint-1 right.
    const w = 15
    const h = 14
    const paint = new Int32Array(w * h)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        paint[y * w + x] = x < 7 ? 0 : x === 7 ? 2 : 1
      }
    }
    const out = segmentRegions(paint, w, h, CHIP_OKLAB, 40)
    const chipsUsed = new Set([...out.regionChip])
    expect(chipsUsed.has(2)).toBe(false) // sliver's paint is gone
  })

  it("merges a thin high-area sliver only when the width gate (minRadiusPx) is set", () => {
    // 1px-tall strip of chip 1 (area 40) between two big chip-0 halves. Its area
    // clears the floor, but it is too narrow to paint — the exact bug the width
    // gate fixes (mirror of the server `_facet_merge` width test).
    const w = 40
    const h = 20
    const paint = new Int32Array(w * h) // all chip 0
    for (let x = 0; x < w; x += 1) paint[10 * w + x] = 1 // row 10 = chip 1
    // width gate OFF (minRadiusPx=0): area 40 ≥ minArea 5 → strip survives
    expect(new Set([...segmentRegions(paint.slice(), w, h, CHIP_OKLAB, 5, 0).regionChip]).has(1)).toBe(true)
    // width gate ON (radius 3): inscribed radius ~0.5 < 3 → merged away
    expect(new Set([...segmentRegions(paint.slice(), w, h, CHIP_OKLAB, 5, 3).regionChip]).has(1)).toBe(false)
    // a fat block (inscribed radius ~5 ≥ 3) must be KEPT
    const block = new Int32Array(30 * 30)
    for (let y = 10; y < 20; y += 1) for (let x = 10; x < 20; x += 1) block[y * 30 + x] = 1
    expect(new Set([...segmentRegions(block, 30, 30, CHIP_OKLAB, 5, 3).regionChip]).has(1)).toBe(true)
  })

  it("guarantees zero same-chip adjacency after the final re-CC", () => {
    // Random noisy paint map (deterministic) → many tiny facets → heavy merging.
    const w = 40
    const h = 40
    const paint = new Int32Array(w * h)
    let seed = 12345
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < paint.length; i += 1) paint[i] = Math.floor(rand() * 4)
    const out = segmentRegions(paint, w, h, CHIP_OKLAB, 20)
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x
        const l = out.labels[i]
        if (x + 1 < w && out.labels[i + 1] !== l) {
          expect(out.regionChip[out.labels[i + 1]]).not.toBe(out.regionChip[l])
        }
        if (y + 1 < h && out.labels[i + w] !== l) {
          expect(out.regionChip[out.labels[i + w]]).not.toBe(out.regionChip[l])
        }
      }
    }
  })

  it("produces more regions at high detail than at low detail (monotone)", () => {
    // A noisy map so there is fine structure the min-area can keep or dissolve.
    const w = 48
    const h = 48
    const paint = new Int32Array(w * h)
    let seed = 99
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = 0; i < paint.length; i += 1) paint[i] = Math.floor(rand() * 4)
    const px = w * h
    const hi = segmentRegions(paint, w, h, CHIP_OKLAB, detailToMinArea(1, px, 0))
    const lo = segmentRegions(paint, w, h, CHIP_OKLAB, detailToMinArea(0, px, 0))
    expect(hi.regionCount).toBeGreaterThan(lo.regionCount)
  })
})

describe("renderRegionsRgba", () => {
  it("fills regions with chip RGB and marks boundaries black", () => {
    const w = 4
    const h = 1
    const labels = Int32Array.from([0, 0, 1, 1])
    const regionChip = Int32Array.from([0, 1])
    const chipRgb: [number, number, number][] = [
      [200, 0, 0],
      [0, 0, 200],
    ]
    const rgba = renderRegionsRgba(labels, regionChip, chipRgb, w, h)
    // pixel 0: interior of region 0 → red
    expect([rgba[0], rgba[1], rgba[2]]).toEqual([200, 0, 0])
    // pixel 1: its right neighbour (pixel 2) is region 1 → boundary → black
    expect([rgba[4], rgba[5], rgba[6]]).toEqual([0, 0, 0])
    // pixel 3: interior of region 1 (no right neighbour, below none) → blue
    expect([rgba[12], rgba[13], rgba[14]]).toEqual([0, 0, 200])
  })
})
