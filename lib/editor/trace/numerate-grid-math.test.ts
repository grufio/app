import { describe, expect, it } from "vitest"

import { gridFromCells, gridFromSuperpixel } from "./numerate-grid-math"

describe("gridFromCells", () => {
  it("exact 10x10 grid on 1000x1000 image", () => {
    const g = gridFromCells(1000, 1000, 10, 10)
    expect(g.superpixelWidth).toBe(100)
    expect(g.superpixelHeight).toBe(100)
    expect(g.totalCells).toBe(100)
    expect(g.leftoverWidth).toBe(0)
    expect(g.leftoverHeight).toBe(0)
    expect(g.isExact).toBe(true)
  })

  it("33x33 cells on 1000x1000 yields 30px cells and 10px leftover each side", () => {
    const g = gridFromCells(1000, 1000, 33, 33)
    expect(g.superpixelWidth).toBe(30)
    expect(g.superpixelHeight).toBe(30)
    expect(g.coveredWidth).toBe(990)
    expect(g.leftoverWidth).toBe(10)
    expect(g.leftoverHeight).toBe(10)
    expect(g.isExact).toBe(false)
  })

  it("non-square superpixel when image is non-square", () => {
    const g = gridFromCells(1920, 1080, 16, 9)
    expect(g.superpixelWidth).toBe(120)
    expect(g.superpixelHeight).toBe(120)
    expect(g.isExact).toBe(true)
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
})

describe("gridFromSuperpixel", () => {
  it("exact 100px cells on 1000x1000 image", () => {
    const g = gridFromSuperpixel(1000, 1000, 100, 100)
    expect(g.cellsX).toBe(10)
    expect(g.cellsY).toBe(10)
    expect(g.isExact).toBe(true)
  })

  it("30px cells on 1000x1000 yields 33 cells with 10px leftover", () => {
    const g = gridFromSuperpixel(1000, 1000, 30, 30)
    expect(g.cellsX).toBe(33)
    expect(g.cellsY).toBe(33)
    expect(g.leftoverWidth).toBe(10)
    expect(g.isExact).toBe(false)
  })

  it("clamps superpixel to >= 1", () => {
    const g = gridFromSuperpixel(1000, 1000, 0, 0)
    expect(g.superpixelWidth).toBe(1)
    expect(g.superpixelHeight).toBe(1)
  })
})
