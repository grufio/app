import { describe, expect, it } from "vitest"

import { gridFromCells, gridFromSuperpixel } from "./numerate-grid-math"

describe("gridFromCells", () => {
  it("exact 10x10 grid on 1000x1000 image", () => {
    const g = gridFromCells(1000, 1000, 10, 10)
    expect(g.superpixelWidth).toBe(100)
    expect(g.superpixelHeight).toBe(100)
    expect(g.totalCells).toBe(100)
  })

  it("30x30 cells on 1514x914 yields fractional pitch (50.4666 x 30.4666)", () => {
    const g = gridFromCells(1514, 914, 30, 30)
    expect(g.superpixelWidth).toBeCloseTo(1514 / 30, 6)
    expect(g.superpixelHeight).toBeCloseTo(914 / 30, 6)
    expect(g.totalCells).toBe(900)
  })

  it("non-square pitch when image is non-square", () => {
    const g = gridFromCells(1920, 1080, 16, 9)
    expect(g.superpixelWidth).toBe(120)
    expect(g.superpixelHeight).toBe(120)
  })

  it("clamps cells to >= 1", () => {
    const g = gridFromCells(1000, 1000, 0, 0)
    expect(g.cellsX).toBe(1)
    expect(g.cellsY).toBe(1)
  })

  it("floors fractional cell input", () => {
    const g = gridFromCells(1000, 1000, 10.7, 5.2)
    expect(g.cellsX).toBe(10)
    expect(g.cellsY).toBe(5)
  })

  it("clamps cells to <= MAX_CELLS_PER_AXIS (50)", () => {
    const g = gridFromCells(4000, 3000, 999, 200)
    expect(g.cellsX).toBe(50)
    expect(g.cellsY).toBe(50)
    expect(g.totalCells).toBe(2500)
    // pitch derives from the clamped cell count, so coverage stays exact
    expect(g.superpixelWidth).toBe(4000 / 50)
    expect(g.superpixelHeight).toBe(3000 / 50)
  })
})

describe("gridFromSuperpixel", () => {
  it("exact 100px pitch on 1000x1000 image", () => {
    const g = gridFromSuperpixel(1000, 1000, 100, 100)
    expect(g.cellsX).toBe(10)
    expect(g.cellsY).toBe(10)
  })

  it("fractional pitch rounds cells", () => {
    const g = gridFromSuperpixel(1514, 914, 50.5, 30.5)
    expect(g.cellsX).toBe(30)
    expect(g.cellsY).toBe(30)
    expect(g.superpixelWidth).toBe(50.5)
    expect(g.superpixelHeight).toBe(30.5)
  })

  it("clamps superpixel to >= 0.1", () => {
    const g = gridFromSuperpixel(1000, 1000, 0, 0)
    expect(g.superpixelWidth).toBe(0.1)
    expect(g.superpixelHeight).toBe(0.1)
  })
})
