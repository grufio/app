/**
 * PAM palette-restriction parity tests (client side). The SAME
 * constructed cases are asserted in the Python sister
 * `filter-service/tests/test_palette_restriction_dispatch.py` — if
 * client and server diverge on PAM medoid selection or the
 * kept-index translation, one side fails here.
 *
 * The wire-contract case (`translateRestrictedIndices round-trips
 * back to original palette positions`) is the critical one — paint-
 * by-numbers labels match on ORIGINAL `palette_index`, so emitting
 * restricted-array positions would silently corrupt the editor's
 * Colors sheet.
 */
import { describe, expect, it } from "vitest"

import { rgb255ToOklab, type Oklab } from "@/lib/color/oklab"

import {
  restrictPalettePam,
  translateRestrictedIndices,
} from "./pam-palette-restriction"
import type { PaletteChip } from "./trace-cell-colors"

function makePalette(
  rgbs: ReadonlyArray<[number, number, number]>,
): PaletteChip[] {
  return rgbs.map((rgb) => ({
    rgb,
    oklab: rgb255ToOklab(rgb[0], rgb[1], rgb[2]) as Oklab,
    notation: "",
    color_name: null,
  }))
}

function uniformCells(H: number, W: number, rgb: [number, number, number]) {
  const n = H * W
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i += 1) {
    r[i] = rgb[0]
    g[i] = rgb[1]
    b[i] = rgb[2]
  }
  return { r, g, b }
}

function fillRegion(
  cells: { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray },
  W: number,
  y0: number,
  y1: number,
  x0: number,
  x1: number,
  rgb: [number, number, number],
) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * W + x
      cells.r[i] = rgb[0]
      cells.g[i] = rgb[1]
      cells.b[i] = rgb[2]
    }
  }
}

describe("restrictPalettePam — PR-I dispatch contract (Python parity)", () => {
  it("`numColors >= palette length` short-circuits to the full palette + identity kept", () => {
    // Mirror of `test_pam_no_op_when_num_colors_ge_palette_size`.
    const palette = makePalette([[0, 0, 0], [128, 128, 128], [255, 255, 255]])
    const cells = uniformCells(4, 4, [100, 100, 100])
    for (const n of [3, 10]) {
      const out = restrictPalettePam({ cells, palette, numColors: n })
      expect(out.palette.length).toBe(3)
      expect(out.kept).toEqual([0, 1, 2])
    }
  })

  it("`numColors` null / 0 / -5 short-circuits to identity", () => {
    // Mirror of `test_pam_no_op_when_num_colors_is_none_or_nonpositive`.
    const palette = makePalette([[0, 0, 0], [128, 128, 128], [255, 255, 255]])
    const cells = uniformCells(4, 4, [100, 100, 100])
    for (const n of [null, 0, -5] as Array<number | null>) {
      const out = restrictPalettePam({ cells, palette, numColors: n })
      expect(out.kept).toEqual([0, 1, 2])
    }
  })

  it("picks one medoid per constructed cluster (warm/cool/gray)", () => {
    // Mirror of `test_pam_picks_one_medoid_per_cluster_in_constructed_input`.
    const palette = makePalette([
      [200, 30, 30],   // 0 — cluster A (warm red)
      [220, 50, 50],   // 1 — cluster A
      [30, 30, 200],   // 2 — cluster B (cool blue)
      [50, 50, 220],   // 3 — cluster B
      [128, 128, 128], // 4 — cluster C (gray)
    ])
    const clusterOf: Record<number, "A" | "B" | "C"> = {
      0: "A", 1: "A", 2: "B", 3: "B", 4: "C",
    }
    // 6×6 grid drawn from the three clusters proportionally.
    const W = 6
    const cells = uniformCells(6, W, [0, 0, 0])
    fillRegion(cells, W, 0, 4, 0, 4, palette[0].rgb as [number, number, number]) // 16 warm-red
    fillRegion(cells, W, 0, 4, 4, 6, palette[2].rgb as [number, number, number]) //  8 cool-blue
    fillRegion(cells, W, 4, 6, 0, 4, palette[3].rgb as [number, number, number]) //  8 cool-blue
    fillRegion(cells, W, 4, 6, 4, 6, palette[4].rgb as [number, number, number]) //  4 mid-gray

    const out = restrictPalettePam({ cells, palette, numColors: 3 })
    expect(out.kept.length).toBe(3)
    const clusters = new Set(out.kept.map((i) => clusterOf[i]))
    expect(clusters).toEqual(new Set(["A", "B", "C"]))
  })

  it("weighted histogram skews to dominant cells", () => {
    // Mirror of `test_pam_weighted_histogram_skews_to_dominant_cells`.
    const palette = makePalette([[255, 0, 0], [0, 255, 0], [0, 0, 255]])
    const W = 4
    const cells = uniformCells(4, W, [255, 0, 0]) // 16 reds
    const i00 = 0
    cells.r[i00] = 0
    cells.g[i00] = 255
    cells.b[i00] = 0 // one green
    const out = restrictPalettePam({ cells, palette, numColors: 1 })
    expect(out.kept).toEqual([0]) // red wins by weight
  })

  it("CIEDE2000 metric runs without crashing and returns a valid medoid set", () => {
    // Mirror of `test_pam_with_ciede2000_metric_does_not_crash`.
    const palette = makePalette([
      [200, 30, 30], [30, 30, 200], [128, 128, 128],
    ])
    const W = 4
    const cells = uniformCells(4, W, [0, 0, 0])
    fillRegion(cells, W, 0, 2, 0, 4, palette[0].rgb as [number, number, number])
    fillRegion(cells, W, 2, 4, 0, 4, palette[1].rgb as [number, number, number])
    const out = restrictPalettePam({
      cells, palette, numColors: 2, distanceMetric: "ciede2000",
    })
    expect(out.kept.length).toBe(2)
    expect(new Set(out.kept).size).toBe(2)
    for (const idx of out.kept) {
      expect([0, 1, 2]).toContain(idx)
    }
  })
})

describe("translateRestrictedIndices — kept-array round-trip (wire contract)", () => {
  it("translates restricted-array positions back to ORIGINAL palette indices", () => {
    // Mirror of `test_translate_palette_indices_round_trips_through_kept`.
    const kept = [2, 5, 11]
    const restricted = [0, 1, 2, 0]
    expect(translateRestrictedIndices(restricted, kept)).toEqual([2, 5, 11, 2])
  })

  it("preserves index order (no sort/dedup side effect)", () => {
    const kept = [4, 9, 13]
    const out = translateRestrictedIndices([2, 0, 1, 2, 1], kept)
    expect(out).toEqual([13, 4, 9, 13, 9])
  })
})
