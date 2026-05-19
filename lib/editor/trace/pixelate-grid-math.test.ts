import { describe, expect, it } from "vitest"

import { isPixelateGridValid, resolvePixelateGrid } from "./pixelate-grid-math"

describe("resolvePixelateGrid", () => {
  it("50x35 mm @ 5x5 mm → 10x7 cells, no border", () => {
    const g = resolvePixelateGrid(50, 35, { supercell_width_mm: 5, supercell_height_mm: 5 })
    expect(g.cellsX).toBe(10)
    expect(g.cellsY).toBe(7)
    expect(g.supercellWidthMm).toBe(5)
    expect(g.supercellHeightMm).toBe(5)
    expect(g.usedMmW).toBe(50)
    expect(g.usedMmH).toBe(35)
    expect(g.borderMmX).toBe(0)
    expect(g.borderMmY).toBe(0)
  })

  it("54x39 mm @ 5x5 mm → 10x7 cells, 4 mm border per axis (centered)", () => {
    const g = resolvePixelateGrid(54, 39, { supercell_width_mm: 5, supercell_height_mm: 5 })
    expect(g.cellsX).toBe(10)
    expect(g.cellsY).toBe(7)
    expect(g.usedMmW).toBe(50)
    expect(g.usedMmH).toBe(35)
    expect(g.borderMmX).toBeCloseTo(4)
    expect(g.borderMmY).toBeCloseTo(4)
  })

  it("asymmetric cells: 100x50 mm @ 6x4 mm → 16x12 cells", () => {
    const g = resolvePixelateGrid(100, 50, { supercell_width_mm: 6, supercell_height_mm: 4 })
    expect(g.cellsX).toBe(16)
    expect(g.cellsY).toBe(12)
    expect(g.usedMmW).toBe(96)
    expect(g.usedMmH).toBe(48)
    expect(g.borderMmX).toBeCloseTo(4)
    expect(g.borderMmY).toBeCloseTo(2)
  })

  it("preserves image-display dimensions on the grid", () => {
    const g = resolvePixelateGrid(80, 50, { supercell_width_mm: 6, supercell_height_mm: 6 })
    expect(g.displayMmW).toBe(80)
    expect(g.displayMmH).toBe(50)
    expect(g.cellsX).toBe(13) // floor(80/6)
    expect(g.cellsY).toBe(8) // floor(50/6)
  })

  it("supercell larger than image → cells go to 0, grid invalid", () => {
    const g = resolvePixelateGrid(4, 4, { supercell_width_mm: 5, supercell_height_mm: 5 })
    expect(g.cellsX).toBe(0)
    expect(g.cellsY).toBe(0)
    expect(isPixelateGridValid(g)).toBe(false)
  })

  it("supercell 0 short-circuits to invalid grid (defensive)", () => {
    const g = resolvePixelateGrid(100, 100, { supercell_width_mm: 0, supercell_height_mm: 0 })
    expect(g.cellsX).toBe(0)
    expect(g.cellsY).toBe(0)
    expect(isPixelateGridValid(g)).toBe(false)
  })
})

describe("isPixelateGridValid", () => {
  it("true when both axes have at least one cell", () => {
    expect(isPixelateGridValid(resolvePixelateGrid(50, 35, { supercell_width_mm: 5, supercell_height_mm: 5 }))).toBe(true)
  })

  it("false when either axis has zero cells", () => {
    expect(isPixelateGridValid(resolvePixelateGrid(4, 35, { supercell_width_mm: 5, supercell_height_mm: 5 }))).toBe(false)
    expect(isPixelateGridValid(resolvePixelateGrid(35, 4, { supercell_width_mm: 5, supercell_height_mm: 5 }))).toBe(false)
  })
})
