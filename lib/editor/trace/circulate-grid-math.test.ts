import { describe, expect, it } from "vitest"

import {
  circulateEllipseFractions,
  isCirculateGridValid,
  resolveCirculateGrid,
  type CirculateGridParams,
} from "./circulate-grid-math"

const BASE: CirculateGridParams = {
  outer_width_mm: 6,
  outer_height_mm: 6,
  spacing_left_mm: 0,
  spacing_right_mm: 0,
  spacing_top_mm: 0,
  spacing_bottom_mm: 0,
}

describe("resolveCirculateGrid", () => {
  it("pitch = outer when spacing is zero; cells = floor(display / pitch)", () => {
    const grid = resolveCirculateGrid(100, 100, BASE)
    expect(grid.pitchWMm).toBe(6)
    expect(grid.pitchHMm).toBe(6)
    expect(grid.cellsX).toBe(16) // floor(100 / 6)
    expect(grid.cellsY).toBe(16)
    expect(grid.usedMmW).toBe(96)
    expect(grid.borderMmX).toBeCloseTo(4)
  })

  it("adds per-axis spacing into the pitch", () => {
    const grid = resolveCirculateGrid(100, 100, {
      ...BASE,
      spacing_left_mm: 1,
      spacing_right_mm: 1,
      spacing_top_mm: 2,
      spacing_bottom_mm: 0,
    })
    // pitch_w = 1 + 6 + 1 = 8; pitch_h = 2 + 6 + 0 = 8.
    expect(grid.pitchWMm).toBe(8)
    expect(grid.pitchHMm).toBe(8)
    expect(grid.cellsX).toBe(12) // floor(100 / 8)
    expect(grid.cellsY).toBe(12)
  })

  it("independent axes: rectangular pitch is allowed", () => {
    const grid = resolveCirculateGrid(100, 60, { ...BASE, outer_width_mm: 10, outer_height_mm: 5 })
    expect(grid.cellsX).toBe(10) // floor(100 / 10)
    expect(grid.cellsY).toBe(12) // floor(60 / 5)
  })

  it("zero pitch yields zero cells (invalid)", () => {
    const grid = resolveCirculateGrid(100, 100, {
      ...BASE,
      outer_width_mm: 0,
      outer_height_mm: 0,
    })
    expect(grid.cellsX).toBe(0)
    expect(grid.cellsY).toBe(0)
  })
})

describe("isCirculateGridValid", () => {
  it("requires at least one whole cell per axis", () => {
    expect(isCirculateGridValid(resolveCirculateGrid(100, 100, BASE))).toBe(true)
    // 4mm image with a 6mm pitch → 0 cells on each axis.
    expect(isCirculateGridValid(resolveCirculateGrid(4, 4, BASE))).toBe(false)
  })
})

describe("circulateEllipseFractions", () => {
  it("ellipse axis / pitch, per axis", () => {
    const grid = resolveCirculateGrid(100, 100, {
      ...BASE,
      spacing_left_mm: 1,
      spacing_right_mm: 1,
    })
    // pitch_w = 8, pitch_h = 6.
    const fr = circulateEllipseFractions(grid, {
      outer_width_mm: 6,
      outer_height_mm: 6,
      inner_width_mm: 4,
      inner_height_mm: 3,
    })
    expect(fr.outerWFrac).toBeCloseTo(0.75) // 6/8
    expect(fr.outerHFrac).toBeCloseTo(1) // 6/6
    expect(fr.innerWFrac).toBeCloseTo(0.5) // 4/8
    expect(fr.innerHFrac).toBeCloseTo(0.5) // 3/6
  })

  it("clamps an oversized inner ellipse to 1 (renderer's (0,1] contract)", () => {
    const grid = resolveCirculateGrid(100, 100, BASE) // pitch 6×6
    const fr = circulateEllipseFractions(grid, {
      outer_width_mm: 6,
      outer_height_mm: 6,
      inner_width_mm: 10, // > pitch
      inner_height_mm: 12, // > pitch
    })
    expect(fr.innerWFrac).toBe(1)
    expect(fr.innerHFrac).toBe(1)
  })
})
