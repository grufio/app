import { describe, expect, it } from "vitest"

import { isNumerateGridValid, resolveNumerateGrid } from "./numerate-grid-math"

describe("resolveNumerateGrid", () => {
  it("50x35 mm @ 5 mm → 10x7 cells, no border", () => {
    const g = resolveNumerateGrid(50, 35, { supercell_mm: 5 })
    expect(g.cellsX).toBe(10)
    expect(g.cellsY).toBe(7)
    expect(g.supercellMm).toBe(5)
    expect(g.usedMmW).toBe(50)
    expect(g.usedMmH).toBe(35)
    expect(g.borderMmX).toBe(0)
    expect(g.borderMmY).toBe(0)
  })

  it("54x39 mm @ 5 mm → 10x7 cells, 4 mm border per axis (centered)", () => {
    const g = resolveNumerateGrid(54, 39, { supercell_mm: 5 })
    expect(g.cellsX).toBe(10)
    expect(g.cellsY).toBe(7)
    expect(g.usedMmW).toBe(50)
    expect(g.usedMmH).toBe(35)
    // 54 - 50 = 4 mm leftover horizontally → 2 mm per side
    // 39 - 35 = 4 mm leftover vertically → 2 mm per side
    expect(g.borderMmX).toBeCloseTo(4)
    expect(g.borderMmY).toBeCloseTo(4)
  })

  it("preserves image-display dimensions on the grid", () => {
    const g = resolveNumerateGrid(80, 50, { supercell_mm: 6 })
    expect(g.displayMmW).toBe(80)
    expect(g.displayMmH).toBe(50)
    expect(g.cellsX).toBe(13) // floor(80/6)
    expect(g.cellsY).toBe(8) // floor(50/6)
  })

  it("supercell larger than image → cells go to 0, grid invalid", () => {
    const g = resolveNumerateGrid(4, 4, { supercell_mm: 5 })
    expect(g.cellsX).toBe(0)
    expect(g.cellsY).toBe(0)
    expect(isNumerateGridValid(g)).toBe(false)
  })

  it("supercell 0 short-circuits to invalid grid (defensive)", () => {
    const g = resolveNumerateGrid(100, 100, { supercell_mm: 0 })
    expect(g.cellsX).toBe(0)
    expect(g.cellsY).toBe(0)
    expect(isNumerateGridValid(g)).toBe(false)
  })
})

describe("isNumerateGridValid", () => {
  it("true when both axes have at least one cell", () => {
    expect(isNumerateGridValid(resolveNumerateGrid(50, 35, { supercell_mm: 5 }))).toBe(true)
  })

  it("false when either axis has zero cells", () => {
    expect(isNumerateGridValid(resolveNumerateGrid(4, 35, { supercell_mm: 5 }))).toBe(false)
    expect(isNumerateGridValid(resolveNumerateGrid(35, 4, { supercell_mm: 5 }))).toBe(false)
  })
})
