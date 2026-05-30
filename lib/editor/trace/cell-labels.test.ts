import { describe, expect, it } from "vitest"

import { computeCellLabels } from "./cell-labels"
import type { PaletteChip } from "./trace-cell-colors"

const PALETTE: PaletteChip[] = [
  { oklab: [0.97, 0, 0.18], rgb: [255, 255, 0] }, // idx 0 — yellow
  { oklab: [0.93, 0.02, 0.16], rgb: [255, 200, 0] }, // idx 1 — light yellow
  { oklab: [0.45, 0.2, 0.12], rgb: [200, 0, 0] }, // idx 2 — red
  { oklab: [0.45, -0.04, -0.31], rgb: [0, 0, 255] }, // idx 3 — blue
]

function cellsFromGrid(grid: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>) {
  const cellsY = grid.length
  const cellsX = grid[0].length
  const total = cellsX * cellsY
  const r = new Uint8ClampedArray(total)
  const g = new Uint8ClampedArray(total)
  const b = new Uint8ClampedArray(total)
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const i = cy * cellsX + cx
      const [rr, gg, bb] = grid[cy][cx]
      r[i] = rr
      g[i] = gg
      b[i] = bb
    }
  }
  return { cellsX, cellsY, cells: { r, g, b } }
}

describe("computeCellLabels", () => {
  it("maps palette indices to 1-based labels sorted by index, matching the server", () => {
    const { cellsX, cellsY, cells } = cellsFromGrid([
      [PALETTE[0].rgb, PALETTE[1].rgb, PALETTE[3].rgb],
      [PALETTE[3].rgb, PALETTE[3].rgb, PALETTE[3].rgb],
      [PALETTE[3].rgb, PALETTE[2].rgb, PALETTE[3].rgb],
    ])
    const result = computeCellLabels({ cells, cellsX, cellsY, palette: PALETTE })
    expect(result).not.toBeNull()
    // Identical to the Python test_pixelate_svg_emits_numbers_group output
    expect(Array.from(result!.labels)).toEqual([1, 2, 4, 4, 4, 4, 4, 3, 4])
  })

  it("returns null when the palette is empty (preview falls back to no labels)", () => {
    const { cellsX, cellsY, cells } = cellsFromGrid([[PALETTE[0].rgb]])
    expect(computeCellLabels({ cells, cellsX, cellsY, palette: [] })).toBeNull()
  })

  it("returns null when a cell colour isn't a palette chip (defensive fallback)", () => {
    const { cellsX, cellsY, cells } = cellsFromGrid([[[1, 2, 3]]])
    expect(computeCellLabels({ cells, cellsX, cellsY, palette: PALETTE })).toBeNull()
  })

  it("skips unused palette indices when numbering (3 distinct used → labels 1..3)", () => {
    const { cellsX, cellsY, cells } = cellsFromGrid([
      [PALETTE[0].rgb, PALETTE[3].rgb],
      [PALETTE[3].rgb, PALETTE[2].rgb],
    ])
    const result = computeCellLabels({ cells, cellsX, cellsY, palette: PALETTE })!
    expect(new Set(result.labels)).toEqual(new Set([1, 2, 3]))
    // idx 0 → 1, idx 2 → 2, idx 3 → 3 (idx 1 is unused, gets no label)
    expect(result.labelByIndex.get(0)).toBe(1)
    expect(result.labelByIndex.get(2)).toBe(2)
    expect(result.labelByIndex.get(3)).toBe(3)
    expect(result.labelByIndex.has(1)).toBe(false)
  })
})
