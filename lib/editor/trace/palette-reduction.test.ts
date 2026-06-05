/**
 * Unit tests for the TS `reduceToTopN` port. The algorithm mirrors
 * `filter-service/app/palette_reduction.py::reduce_to_top_n` and the
 * mathematical contract is shared with both the Python end-to-end
 * coverage (`test_pixelate.py::test_num_colors_caps_output_chip_count`,
 * `test_circulate.py::test_num_colors_caps_circulate_output_chip_count`)
 * and the preview pipelines that now call it pre-render.
 */
import { describe, expect, it } from "vitest"

import { rgb255ToOklab } from "@/lib/color/oklab"

import { reduceToTopN } from "./palette-reduction"
import type { CellColors, PaletteChip } from "./trace-cell-colors"

function makeChip(rgb: [number, number, number]): PaletteChip {
  return {
    oklab: rgb255ToOklab(rgb[0], rgb[1], rgb[2]),
    rgb,
    notation: rgb.join(","),
    iscc_nbs_name: null,
  }
}

function cellsFromIndices(indices: number[], palette: PaletteChip[]): CellColors {
  const n = indices.length
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i += 1) {
    const chip = palette[indices[i]].rgb
    r[i] = chip[0]
    g[i] = chip[1]
    b[i] = chip[2]
  }
  return { r, g, b }
}

function distinctChips(cells: CellColors): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < cells.r.length; i += 1) {
    out.add(`${cells.r[i]},${cells.g[i]},${cells.b[i]}`)
  }
  return out
}

describe("reduceToTopN", () => {
  const palette: PaletteChip[] = [
    makeChip([0, 0, 0]),
    makeChip([200, 0, 0]),
    makeChip([0, 200, 0]),
    makeChip([0, 0, 200]),
    makeChip([200, 200, 0]),
  ]

  it("returns the input unchanged when numColors >= distinct snap winners", () => {
    // 3 distinct chips used; cap at 4 is a no-op.
    const cells = cellsFromIndices([0, 0, 1, 1, 2, 2], palette)
    const result = reduceToTopN(cells, palette, 4)
    expect(result.didReduce).toBe(false)
    expect(result.cells).toBe(cells)
  })

  it("returns the input unchanged when numColors is null/<=0", () => {
    const cells = cellsFromIndices([1, 2, 3], palette)
    expect(reduceToTopN(cells, palette, null).didReduce).toBe(false)
    expect(reduceToTopN(cells, palette, 0).didReduce).toBe(false)
    expect(reduceToTopN(cells, palette, -5).didReduce).toBe(false)
  })

  it("returns the input unchanged when palette is empty", () => {
    const cells = cellsFromIndices([0, 1], palette)
    expect(reduceToTopN(cells, [], 2).didReduce).toBe(false)
  })

  it("caps to top-N by occurrence count when distinct > numColors", () => {
    // Five distinct chips, counts 4/3/2/1/1 → top 3 = [0, 1, 2].
    const cells = cellsFromIndices(
      [0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4],
      palette,
    )
    const result = reduceToTopN(cells, palette, 3)
    expect(result.didReduce).toBe(true)
    const distinct = distinctChips(result.cells)
    expect(distinct.size).toBeLessThanOrEqual(3)
    // The four most-used chips must survive verbatim; indices 3 and 4
    // (one cell each) get re-snapped into the kept set.
    expect(distinct.has("0,0,0")).toBe(true)
    expect(distinct.has("200,0,0")).toBe(true)
    expect(distinct.has("0,200,0")).toBe(true)
  })

  it("re-snaps excluded cells to the nearest kept chip in OKLab", () => {
    // Kept chips will be black (0,0,0) and yellow (200,200,0); the
    // excluded red cell (200,0,0) should re-snap to yellow (closer in
    // OKLab than to black for a saturated red).
    const cells = cellsFromIndices([0, 0, 0, 4, 4, 4, 1], palette)
    const result = reduceToTopN(cells, palette, 2)
    expect(result.didReduce).toBe(true)
    const distinct = distinctChips(result.cells)
    expect(distinct.size).toBeLessThanOrEqual(2)
    expect(distinct.has("0,0,0")).toBe(true)
    expect(distinct.has("200,200,0")).toBe(true)
    expect(distinct.has("200,0,0")).toBe(false) // excluded red was re-snapped
  })
})
