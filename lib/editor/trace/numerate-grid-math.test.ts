import { describe, expect, it } from "vitest"

import {
  isNumerateGridValid,
  resolveNumerateGrid,
  type NumerateGridParams,
} from "./numerate-grid-math"

const square = (supercell_mm: number, primary_count: number): NumerateGridParams => ({
  supercell_mm,
  multiple_axis: "none",
  multiple: 1,
  primary_count,
})

describe("resolveNumerateGrid", () => {
  it("worked example: 4000x3000, 5mm square, 100 primary -> 100x75, no border", () => {
    const g = resolveNumerateGrid(4000, 3000, square(5, 100))
    expect(g.primaryAxis).toBe("horizontal")
    expect(g.cellsX).toBe(100)
    expect(g.cellsY).toBe(75)
    expect(g.cellMmW).toBe(5)
    expect(g.cellMmH).toBe(5)
    expect(g.cropW).toBe(4000)
    expect(g.cropH).toBe(3000)
    expect(g.cropX).toBe(0)
    expect(g.cropY).toBe(0)
    expect(g.borderPx).toBe(0)
  })

  it("rectangular cells (x2 vertical): 4000x3000, 5mm, 100 primary -> 100x37, centred 40px border", () => {
    const g = resolveNumerateGrid(4000, 3000, {
      supercell_mm: 5,
      multiple_axis: "vertical",
      multiple: 2,
      primary_count: 100,
    })
    expect(g.cellsX).toBe(100)
    expect(g.cellsY).toBe(37) // floor(3000 / 80)
    expect(g.cellMmW).toBe(5)
    expect(g.cellMmH).toBe(10)
    expect(g.cropH).toBe(2960) // 37 * 80
    expect(g.cropY).toBe(20) // (3000 - 2960) / 2
    expect(g.borderPx).toBe(40)
  })

  it("non-even format leaves a centred border on the secondary axis", () => {
    const g = resolveNumerateGrid(4000, 3100, square(5, 100))
    // cellSourcePx 40x40 -> cellsY = floor(3100/40) = 77, covered 3080
    expect(g.cellsY).toBe(77)
    expect(g.cropH).toBe(3080)
    expect(g.cropY).toBe(10)
    expect(g.borderPx).toBe(20)
  })

  it("portrait image -> primary axis is vertical", () => {
    const g = resolveNumerateGrid(3000, 4000, square(5, 100))
    expect(g.primaryAxis).toBe("vertical")
    expect(g.cellsY).toBe(100)
    expect(g.cellsX).toBe(75) // floor(3000 / 40)
    expect(g.cropW).toBe(3000)
    expect(g.cropX).toBe(0)
    expect(g.borderPx).toBe(0)
  })

  it("horizontal multiple stretches cellMmW, not cellMmH", () => {
    const g = resolveNumerateGrid(4000, 3000, {
      supercell_mm: 6,
      multiple_axis: "horizontal",
      multiple: 3,
      primary_count: 50,
    })
    expect(g.cellMmW).toBe(18)
    expect(g.cellMmH).toBe(6)
  })

  it("clamps multiple to >= 1 and primary_count to >= 1", () => {
    const g = resolveNumerateGrid(4000, 3000, {
      supercell_mm: 5,
      multiple_axis: "vertical",
      multiple: 0,
      primary_count: 0,
    })
    expect(g.cellMmH).toBe(5) // multiple clamped to 1
    expect(g.cellsX).toBe(1) // primary_count clamped to 1
  })
})

describe("isNumerateGridValid", () => {
  it("accepts a grid with whole cells on both axes", () => {
    expect(isNumerateGridValid(resolveNumerateGrid(4000, 3000, square(5, 100)))).toBe(true)
  })

  it("rejects a degenerate grid where no whole secondary cell fits", () => {
    // primary_count 1 on a 4000-wide image -> 4000px square cell,
    // taller than the 3000px image -> cellsY = 0.
    const g = resolveNumerateGrid(4000, 3000, square(5, 1))
    expect(g.cellsY).toBe(0)
    expect(isNumerateGridValid(g)).toBe(false)
  })
})
