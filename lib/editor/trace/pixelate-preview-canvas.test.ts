import { describe, expect, it } from "vitest"

import { buildPixelatePreviewImageData, pixelatePreviewGridDevicePx } from "./pixelate-preview-canvas"

describe("buildPixelatePreviewImageData", () => {
  // 2×2 grid; colour index i = cy*cellsX + cx.
  const cells = {
    r: Uint8ClampedArray.from([255, 0, 16, 5]),
    g: Uint8ClampedArray.from([0, 255, 16, 5]),
    b: Uint8ClampedArray.from([0, 0, 16, 5]),
  }

  it("packs one opaque RGBA pixel per cell, row-major", () => {
    const data = buildPixelatePreviewImageData(cells, 2, 2)
    expect(data).toHaveLength(2 * 2 * 4)
    expect(Array.from(data.slice(0, 4))).toEqual([255, 0, 0, 255]) // (0,0)
    expect(Array.from(data.slice(4, 8))).toEqual([0, 255, 0, 255]) // (1,0)
    expect(Array.from(data.slice(8, 12))).toEqual([16, 16, 16, 255]) // (0,1)
    expect(Array.from(data.slice(12, 16))).toEqual([5, 5, 5, 255]) // (1,1)
  })
})

describe("pixelatePreviewGridDevicePx", () => {
  it("rounds cell boundaries (0..cells) to whole device px, clamping the last", () => {
    const { xs, ys } = pixelatePreviewGridDevicePx(2, 2, 100, 80)
    // i=0→0, i=1→50, i=2→round(100)=100 → clamp to 99
    expect(xs).toEqual([0, 50, 99])
    expect(ys).toEqual([0, 40, 79])
  })

  it("keeps every line inside the canvas (< dim)", () => {
    const { xs, ys } = pixelatePreviewGridDevicePx(7, 11, 320, 240)
    expect(Math.max(...xs)).toBeLessThan(320)
    expect(Math.max(...ys)).toBeLessThan(240)
    expect(xs[0]).toBe(0)
    expect(ys[0]).toBe(0)
    expect(xs).toHaveLength(8)
    expect(ys).toHaveLength(12)
  })
})
