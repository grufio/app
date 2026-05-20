import { describe, expect, it } from "vitest"

import { centeredCropPixels, isPixelateGridValid, resolvePixelateGrid } from "./pixelate-grid-math"

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

describe("centeredCropPixels", () => {
  it("zero border maps the crop to the full pixel region", () => {
    const grid = resolvePixelateGrid(50, 35, { supercell_width_mm: 5, supercell_height_mm: 5 })
    const crop = centeredCropPixels({ pixelW: 1000, pixelH: 700, displayMmW: 50, displayMmH: 35, grid })
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
    expect(crop.w).toBeCloseTo(1000)
    expect(crop.h).toBeCloseTo(700)
  })

  it("symmetric crop: 100x75 mm @ 6 mm, scratch 1000x750", () => {
    const grid = resolvePixelateGrid(100, 75, { supercell_width_mm: 6, supercell_height_mm: 6 })
    // borderMmX = 100 - 16*6 = 4, borderMmY = 75 - 12*6 = 3
    const crop = centeredCropPixels({ pixelW: 1000, pixelH: 750, displayMmW: 100, displayMmH: 75, grid })
    expect(crop.x).toBeCloseTo(20) // (4/2) * (1000/100) = 20
    expect(crop.y).toBeCloseTo(15) // (3/2) * (750/75) = 15
    expect(crop.w).toBeCloseTo(960) // 96 * 10
    expect(crop.h).toBeCloseTo(720) // 72 * 10
    // Symmetry: crop is centred → crop.x + crop.w/2 === pixelW/2
    expect(crop.x + crop.w / 2).toBeCloseTo(500)
    expect(crop.y + crop.h / 2).toBeCloseTo(375)
  })

  it("scale-invariant: crop fraction stays identical at scratch vs source resolution", () => {
    const grid = resolvePixelateGrid(100, 75, { supercell_width_mm: 6, supercell_height_mm: 6 })
    const scratchCrop = centeredCropPixels({ pixelW: 500, pixelH: 375, displayMmW: 100, displayMmH: 75, grid })
    const sourceCrop = centeredCropPixels({ pixelW: 4000, pixelH: 3000, displayMmW: 100, displayMmH: 75, grid })
    // Same crop, two scales: relative fractions match
    expect(scratchCrop.x / 500).toBeCloseTo(sourceCrop.x / 4000)
    expect(scratchCrop.y / 375).toBeCloseTo(sourceCrop.y / 3000)
    expect(scratchCrop.w / 500).toBeCloseTo(sourceCrop.w / 4000)
    expect(scratchCrop.h / 375).toBeCloseTo(sourceCrop.h / 3000)
  })

  it("asymmetric cells: 100x50 mm @ 6x4 mm", () => {
    const grid = resolvePixelateGrid(100, 50, { supercell_width_mm: 6, supercell_height_mm: 4 })
    const crop = centeredCropPixels({ pixelW: 1000, pixelH: 500, displayMmW: 100, displayMmH: 50, grid })
    // border 4 mm in X, 2 mm in Y → 2 mm + 1 mm on each side
    expect(crop.x).toBeCloseTo(20)
    expect(crop.y).toBeCloseTo(10)
    expect(crop.w).toBeCloseTo(960)
    expect(crop.h).toBeCloseTo(480)
  })
})
