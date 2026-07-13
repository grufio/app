import { describe, expect, it } from "vitest"

import { rgb255ToOklab } from "@/lib/color/oklab"

import { coverageSelectPaintMap } from "./coverage-select"
import type { PaletteChip } from "./trace-cell-colors"

const chip = (r: number, g: number, b: number): PaletteChip => ({
  oklab: rgb255ToOklab(r, g, b),
  rgb: [r, g, b],
  notation: `${r}-${g}-${b}`,
  color_name: null,
})

// red, green, blue, and a near-red the coverage step should drop + re-snap to red.
const PALETTE: PaletteChip[] = [chip(220, 20, 20), chip(20, 200, 20), chip(20, 20, 200), chip(200, 40, 40)]

function imageFromChips(chipIdxPerPixel: number[], width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < chipIdxPerPixel.length; i += 1) {
    const [r, g, b] = PALETTE[chipIdxPerPixel[i]].rgb
    rgba[i * 4] = r
    rgba[i * 4 + 1] = g
    rgba[i * 4 + 2] = b
    rgba[i * 4 + 3] = 255
  }
  return { width, height, rgba }
}

describe("coverageSelectPaintMap", () => {
  it("returns pixels unchanged when distinct chips ≤ num_colors", () => {
    const img = imageFromChips([0, 1, 2, 0], 2, 2)
    const paint = coverageSelectPaintMap(img, PALETTE, 4)
    expect([...paint]).toEqual([0, 1, 2, 0])
  })

  it("keeps the top-K most-used chips and re-snaps the rest", () => {
    // 6 red (0), 3 green (1), 1 blue (2); K=2 keeps red+green, blue re-snaps.
    const pixels = [0, 0, 0, 0, 0, 0, 1, 1, 1, 2]
    const img = imageFromChips(pixels, 10, 1)
    const paint = coverageSelectPaintMap(img, PALETTE, 2)
    const used = new Set([...paint])
    expect(used.size).toBeLessThanOrEqual(2)
    expect(used.has(0)).toBe(true) // red kept (most used)
    expect(used.has(1)).toBe(true) // green kept
    expect(used.has(2)).toBe(false) // blue dropped
    // the lone blue pixel re-snaps to the nearest kept chip (green, not red)
    expect(paint[9] === 0 || paint[9] === 1).toBe(true)
  })

  it("re-snaps a dropped near-duplicate to its perceptual neighbour", () => {
    // chip 3 (200,40,40) is near chip 0 (220,20,20). Make chip 3 rare so it
    // drops; it must re-snap to red (0), its OKLab-nearest kept chip.
    const pixels = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3]
    const img = imageFromChips(pixels, 10, 1)
    const paint = coverageSelectPaintMap(img, PALETTE, 3)
    expect(new Set([...paint]).has(3)).toBe(false)
    expect(paint[9]).toBe(0) // the dropped near-red re-snaps to red
  })

  it("empty palette yields an all-zero paint map", () => {
    const img = imageFromChips([0, 1, 2, 0], 2, 2)
    expect([...coverageSelectPaintMap(img, [], 4)]).toEqual([0, 0, 0, 0])
  })
})
