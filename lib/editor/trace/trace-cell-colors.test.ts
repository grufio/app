import { describe, expect, it } from "vitest"

import { rgb255ToOklab, type Oklab } from "@/lib/color/oklab"
import {
  cellAreaAverages,
  mapCellsToPalette,
  mapCellsToPaletteAdjusted,
  type PaletteChip,
} from "./trace-cell-colors"

/** Build a palette chip from an RGB triple (OKLab derived the same way the
 * DB columns + the cell matcher do, so the match is self-consistent). */
function chip(r: number, g: number, b: number): PaletteChip {
  return {
    oklab: rgb255ToOklab(r, g, b) as Oklab,
    rgb: [r, g, b] as const,
    notation: "",
    color_name: null,
  }
}

/** Build a CellColors triple from RGB cells in row order. */
function cellsFrom(pixels: Array<[number, number, number]>) {
  const n = pixels.length
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)
  pixels.forEach(([cr, cg, cb], i) => {
    r[i] = cr
    g[i] = cg
    b[i] = cb
  })
  return { r, g, b }
}

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

  // The Vercel-side trace handler will feed `sharp(...).raw()` output here —
  // alpha-stripped RGB, 3 bytes/pixel. The math must match the canvas RGBA
  // case exactly (same area-average, just a different stride).
  it("bytesPerPixel: 3 matches the RGBA result on the same pixels", () => {
    const pixels: Array<[number, number, number]> = [
      [0, 0, 0],
      [100, 100, 100],
      [10, 20, 30],
      [30, 40, 50],
      [200, 200, 200],
      [0, 0, 0],
      [50, 60, 70],
      [70, 80, 90],
    ]
    const rgba = rgbaFrom(pixels)
    const rgb = new Uint8Array(pixels.length * 3)
    pixels.forEach(([r, g, b], i) => {
      rgb[i * 3] = r
      rgb[i * 3 + 1] = g
      rgb[i * 3 + 2] = b
    })

    const refOut = cellAreaAverages({ rgba, width: 4, height: 2, cellsX: 2, cellsY: 1 })
    const rgbOut = cellAreaAverages({
      rgba: rgb,
      width: 4,
      height: 2,
      cellsX: 2,
      cellsY: 1,
      bytesPerPixel: 3,
    })

    expect(Array.from(rgbOut.r)).toEqual(Array.from(refOut.r))
    expect(Array.from(rgbOut.g)).toEqual(Array.from(refOut.g))
    expect(Array.from(rgbOut.b)).toEqual(Array.from(refOut.b))
  })
})

describe("mapCellsToPalette", () => {
  it("snaps each cell to the nearest palette chip's RGB", () => {
    const palette = [chip(0, 0, 0), chip(255, 255, 255), chip(255, 0, 0)]
    // Near-black, near-white, near-red means → exact chip RGB.
    const cells = cellsFrom([
      [10, 10, 10],
      [240, 245, 250],
      [230, 20, 15],
    ])
    const { r, g, b } = mapCellsToPalette(cells, palette)
    expect([r[0], g[0], b[0]]).toEqual([0, 0, 0])
    expect([r[1], g[1], b[1]]).toEqual([255, 255, 255])
    expect([r[2], g[2], b[2]]).toEqual([255, 0, 0])
  })

  it("returns the input means unchanged when the palette is empty (loading fallback)", () => {
    const cells = cellsFrom([
      [10, 20, 30],
      [40, 50, 60],
    ])
    const out = mapCellsToPalette(cells, [])
    expect(out).toBe(cells)
  })

  it("maps every cell, including duplicates, to a single chip", () => {
    const palette = [chip(0, 0, 0), chip(255, 255, 255)]
    const cells = cellsFrom([
      [5, 5, 5],
      [250, 250, 250],
      [120, 120, 120],
      [130, 130, 130],
    ])
    const { r, g, b } = mapCellsToPalette(cells, palette)
    expect([r[0], g[0], b[0]]).toEqual([0, 0, 0])
    expect([r[1], g[1], b[1]]).toEqual([255, 255, 255])
    // Midtones snap to whichever chip is nearer in OKLab; both are valid chips.
    for (let i = 2; i < 4; i += 1) {
      const picked: [number, number, number] = [r[i], g[i], b[i]]
      expect([
        [0, 0, 0],
        [255, 255, 255],
      ]).toContainEqual(picked)
    }
  })
})

describe("mapCellsToPaletteAdjusted", () => {
  const palette = [chip(200, 0, 0), chip(0, 200, 0), chip(0, 0, 200), chip(80, 0, 0), chip(255, 120, 120)]
  const IDENTITY = { hueDeg: 0, lightnessDelta: 0, chromaScale: 1 }

  it("the identity adjustment reduces to a plain palette snap", () => {
    const cells = cellsFrom([[200, 30, 40]])
    const adjusted = mapCellsToPaletteAdjusted(cells, palette, IDENTITY)
    const plain = mapCellsToPalette(cells, palette)
    expect([adjusted.r[0], adjusted.g[0], adjusted.b[0]]).toEqual([plain.r[0], plain.g[0], plain.b[0]])
    expect([adjusted.r[0], adjusted.g[0], adjusted.b[0]]).toEqual([200, 0, 0]) // reddish → red chip
  })

  it("a ~120° hue rotation of red lands on a different chip", () => {
    const cells = cellsFrom([[200, 30, 40]])
    const out = mapCellsToPaletteAdjusted(cells, palette, { hueDeg: 120, lightnessDelta: 0, chromaScale: 1 })
    const picked: [number, number, number] = [out.r[0], out.g[0], out.b[0]]
    expect(picked).not.toEqual([200, 0, 0]) // moved off red
    expect([
      [0, 200, 0],
      [0, 0, 200],
    ]).toContainEqual(picked)
  })

  it("a negative lightness delta ('darker') lands on a darker chip", () => {
    // Bright-ish red cell → without adjustment snaps to red (200,0,0); darken
    // → the darker red chip (80,0,0).
    const cells = cellsFrom([[210, 20, 20]])
    const plain = mapCellsToPalette(cells, palette)
    expect([plain.r[0], plain.g[0], plain.b[0]]).toEqual([200, 0, 0])
    const darker = mapCellsToPaletteAdjusted(cells, palette, { hueDeg: 0, lightnessDelta: -0.2, chromaScale: 1 })
    expect([darker.r[0], darker.g[0], darker.b[0]]).toEqual([80, 0, 0])
  })

  it("returns the input unchanged for an empty palette (loading fallback)", () => {
    const cells = cellsFrom([[10, 20, 30]])
    expect(mapCellsToPaletteAdjusted(cells, [], { hueDeg: 90, lightnessDelta: -0.2, chromaScale: 1 })).toBe(cells)
  })
})
