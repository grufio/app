import { describe, expect, it } from "vitest"

import { cellAreaAverages } from "./trace-cell-colors"

/**
 * Helper: build a flat RGBA buffer (row-major, alpha=255) from an
 * array of [r,g,b] triples in pixel order.
 */
function rgbaFrom(pixels: Array<[number, number, number]>): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b], i) => {
    buf[i * 4] = r
    buf[i * 4 + 1] = g
    buf[i * 4 + 2] = b
    buf[i * 4 + 3] = 255
  })
  return buf
}

describe("cellAreaAverages", () => {
  it("averages every source pixel in a cell (4×2 → 2×1 cells)", () => {
    // Row0: (0,0,0) (100,100,100) (10,20,30) (30,40,50)
    // Row1: (200,200,200) (0,0,0) (50,60,70) (70,80,90)
    // cellsX=2 → cols {0,1}→cell0, {2,3}→cell1; cellsY=1 → both rows.
    const rgba = rgbaFrom([
      [0, 0, 0],
      [100, 100, 100],
      [10, 20, 30],
      [30, 40, 50],
      [200, 200, 200],
      [0, 0, 0],
      [50, 60, 70],
      [70, 80, 90],
    ])
    const { r, g, b } = cellAreaAverages({ rgba, width: 4, height: 2, cellsX: 2, cellsY: 1 })

    // cell0 = mean of (0,0,0),(100,100,100),(200,200,200),(0,0,0) = 75 each
    expect([r[0], g[0], b[0]]).toEqual([75, 75, 75])
    // cell1 = mean of (10,20,30),(30,40,50),(50,60,70),(70,80,90) = (40,50,60)
    expect([r[1], g[1], b[1]]).toEqual([40, 50, 60])
  })

  it("a uniform image yields that colour in every cell", () => {
    const rgba = rgbaFrom(Array.from({ length: 6 }, () => [12, 34, 56] as [number, number, number]))
    const { r, g, b } = cellAreaAverages({ rgba, width: 3, height: 2, cellsX: 3, cellsY: 2 })
    for (let i = 0; i < 6; i += 1) {
      expect([r[i], g[i], b[i]]).toEqual([12, 34, 56])
    }
  })

  it("1 cell per pixel is an identity mapping", () => {
    const rgba = rgbaFrom([
      [11, 22, 33],
      [44, 55, 66],
    ])
    const { r, g, b } = cellAreaAverages({ rgba, width: 2, height: 1, cellsX: 2, cellsY: 1 })
    expect([r[0], g[0], b[0]]).toEqual([11, 22, 33])
    expect([r[1], g[1], b[1]]).toEqual([44, 55, 66])
  })

  it("rounds the mean to the nearest integer channel", () => {
    // Two pixels in one cell: (0,0,0) + (1,1,1) → mean 0.5 → rounds to 1 (Math.round, ties up).
    const rgba = rgbaFrom([
      [0, 0, 0],
      [1, 1, 1],
    ])
    const { r, g, b } = cellAreaAverages({ rgba, width: 2, height: 1, cellsX: 1, cellsY: 1 })
    expect([r[0], g[0], b[0]]).toEqual([1, 1, 1])
  })
})
