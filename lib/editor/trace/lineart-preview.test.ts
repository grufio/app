import { describe, expect, it } from "vitest"

import {
  gaussianBlur,
  kMeansOklab,
  snapCentroidsToPalette,
  type PreviewImage,
} from "./lineart-preview"
import type { PaletteChip } from "./trace-cell-colors"

function makeSolidImage(width: number, height: number, r: number, g: number, b: number): PreviewImage {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r
    rgba[i + 1] = g
    rgba[i + 2] = b
    rgba[i + 3] = 255
  }
  return { width, height, rgba }
}

function makeTwoColorImage(): PreviewImage {
  // 4x2 image: left half red, right half blue.
  const width = 4
  const height = 2
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4
      const isLeft = x < width / 2
      rgba[o] = isLeft ? 255 : 0
      rgba[o + 1] = 0
      rgba[o + 2] = isLeft ? 0 : 255
      rgba[o + 3] = 255
    }
  }
  return { width, height, rgba }
}

describe("gaussianBlur", () => {
  it("returns input unchanged when radius ≤ 0", () => {
    const image = makeSolidImage(2, 2, 100, 150, 200)
    const result = gaussianBlur(image, 0)
    expect(result.rgba).toBe(image.rgba)
  })

  it("preserves solid colour on a uniform image", () => {
    const image = makeSolidImage(8, 8, 100, 150, 200)
    const result = gaussianBlur(image, 2)
    // Every output pixel should be (approximately) the input colour.
    for (let i = 0; i < result.rgba.length; i += 4) {
      expect(result.rgba[i]).toBeGreaterThanOrEqual(99)
      expect(result.rgba[i]).toBeLessThanOrEqual(101)
      expect(result.rgba[i + 1]).toBeGreaterThanOrEqual(149)
      expect(result.rgba[i + 1]).toBeLessThanOrEqual(151)
      expect(result.rgba[i + 2]).toBeGreaterThanOrEqual(199)
      expect(result.rgba[i + 2]).toBeLessThanOrEqual(200)
    }
  })
})

describe("kMeansOklab", () => {
  it("returns empty result for empty input", () => {
    const image: PreviewImage = { width: 0, height: 0, rgba: new Uint8ClampedArray(0) }
    const result = kMeansOklab(image, 4, 10)
    expect(result.centroids).toEqual([])
    expect(result.assignments.length).toBe(0)
  })

  it("converges to two centroids on a clearly two-colour image", () => {
    const image = makeTwoColorImage()
    const result = kMeansOklab(image, 2, 20)
    expect(result.centroids).toHaveLength(2)
    expect(result.assignments.length).toBe(image.width * image.height)
    // Every assignment is a valid centroid index.
    for (let i = 0; i < result.assignments.length; i += 1) {
      expect(result.assignments[i]).toBeGreaterThanOrEqual(0)
      expect(result.assignments[i]).toBeLessThan(2)
    }
    // Pixels at the same column should be in the same cluster (both rows
    // share the same colour per column).
    for (let x = 0; x < image.width; x += 1) {
      expect(result.assignments[x]).toBe(result.assignments[x + image.width])
    }
    // Left half and right half should be in different clusters.
    const leftCluster = result.assignments[0]
    const rightCluster = result.assignments[image.width - 1]
    expect(leftCluster).not.toBe(rightCluster)
  })

  it("is deterministic for the same input", () => {
    const image = makeTwoColorImage()
    const a = kMeansOklab(image, 2, 10)
    const b = kMeansOklab(image, 2, 10)
    expect(Array.from(a.assignments)).toEqual(Array.from(b.assignments))
    expect(a.centroids).toEqual(b.centroids)
  })

  it("caps centroids at the number of distinct pixels when k > n", () => {
    const image = makeSolidImage(2, 1, 100, 100, 100)
    const result = kMeansOklab(image, 8, 10)
    // n=2 pixels, k=8 requested → seeded with min(k,n)=2 centroids
    expect(result.centroids.length).toBeLessThanOrEqual(2)
  })
})

describe("snapCentroidsToPalette", () => {
  const palette: PaletteChip[] = [
    { oklab: [0.5, 0.2, 0.1], rgb: [200, 50, 50], notation: "fake-red", color_name: "Red" },
    { oklab: [0.5, -0.2, -0.1], rgb: [50, 50, 200], notation: "fake-blue", color_name: "Blue" },
  ]

  it("snaps each centroid to its nearest palette chip", () => {
    const centroids: [number, number, number][] = [
      [0.5, 0.21, 0.09], // close to red
      [0.5, -0.21, -0.09], // close to blue
    ]
    const result = snapCentroidsToPalette(centroids, palette)
    expect(result).toEqual([
      { r: 200, g: 50, b: 50 },
      { r: 50, g: 50, b: 200 },
    ])
  })

  it("returns a deterministic grey fallback for an empty palette", () => {
    const centroids: [number, number, number][] = [
      [0.0, 0, 0],
      [0.5, 0, 0],
      [1.0, 0, 0],
    ]
    const result = snapCentroidsToPalette(centroids, [])
    expect(result[0]).toEqual({ r: 0, g: 0, b: 0 })
    expect(result[2]).toEqual({ r: 255, g: 255, b: 255 })
    // L=0.5 should land in the middle grey-ish.
    expect(result[1].r).toBe(result[1].g)
    expect(result[1].g).toBe(result[1].b)
  })
})
