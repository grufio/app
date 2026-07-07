import { describe, expect, it } from "vitest"

import {
  addStrokeToPath,
  buildLineartPreviewSvg,
  extractPathElements,
  gaussianBlur,
  kMeansOklab,
  quantizedRgbaFromClusters,
  snapCentroidsToPalette,
  snapPathFillsToPalette,
  type PreviewImage,
} from "./lineart-preview"
import { rgb255ToOklab } from "@/lib/color/oklab"

import type { PaletteChip } from "./trace-cell-colors"

const rgb255ToOklabTuple = (r: number, g: number, b: number) =>
  rgb255ToOklab(r, g, b) as [number, number, number]

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

describe("quantizedRgbaFromClusters", () => {
  it("paints each pixel with its cluster's mean source colour", () => {
    // 2x1: pixel 0 = red (cluster 0), pixel 1 = blue (cluster 1).
    const image: PreviewImage = {
      width: 2,
      height: 1,
      rgba: Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 255, 255]),
    }
    const assignments = Uint16Array.from([0, 1])
    const out = quantizedRgbaFromClusters({ image, assignments, clusterCount: 2 })
    expect(Array.from(out.slice(0, 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(out.slice(4, 8))).toEqual([0, 0, 255, 255])
  })

  it("averages pixels sharing a cluster", () => {
    // both pixels in cluster 0: means of (100,0,0) and (200,0,0) → 150.
    const image: PreviewImage = {
      width: 2,
      height: 1,
      rgba: Uint8ClampedArray.from([100, 0, 0, 255, 200, 0, 0, 255]),
    }
    const out = quantizedRgbaFromClusters({
      image,
      assignments: Uint16Array.from([0, 0]),
      clusterCount: 1,
    })
    expect(out[0]).toBe(150)
    expect(out[4]).toBe(150)
    expect(out[3]).toBe(255)
  })
})

describe("extractPathElements", () => {
  it("pulls every self-closing <path> out of a vtracer envelope", () => {
    const svg =
      '<svg><path d="M0 0 C1 1 2 2 3 3" fill="#112233" transform="translate(1,2)"/>' +
      '<path d="M9 9" fill="#445566"/></svg>'
    const paths = extractPathElements(svg)
    expect(paths).toHaveLength(2)
    expect(paths[0]).toContain('fill="#112233"')
    expect(paths[1]).toContain('fill="#445566"')
  })
})

describe("snapPathFillsToPalette", () => {
  const palette: PaletteChip[] = [
    { oklab: rgb255ToOklabTuple(200, 50, 50), rgb: [200, 50, 50], notation: "r", color_name: "Red" },
    { oklab: rgb255ToOklabTuple(50, 50, 200), rgb: [50, 50, 200], notation: "b", color_name: "Blue" },
  ]

  it("snaps each path fill to the nearest chip and reports used indices", () => {
    const paths = [
      '<path d="M0 0" fill="#c8322f"/>', // ≈ red
      '<path d="M1 1" fill="#3134c6" transform="translate(2,3)"/>', // ≈ blue
    ]
    const { paths: out, indicesUsed } = snapPathFillsToPalette(paths, palette)
    expect(out[0]).toContain('fill="#c83232"') // palette red 200,50,50
    expect(out[0]).toContain('d="M0 0"')
    expect(out[1]).toContain('fill="#3232c8"') // palette blue 50,50,200
    expect(out[1]).toContain('transform="translate(2,3)"') // untouched
    expect(indicesUsed).toEqual([0, 1])
  })

  it("leaves paths untouched for an empty palette", () => {
    const paths = ['<path d="M0 0" fill="#abcdef"/>']
    const { paths: out, indicesUsed } = snapPathFillsToPalette(paths, [])
    expect(out).toEqual(paths)
    expect(indicesUsed).toEqual([])
  })
})

describe("addStrokeToPath", () => {
  it("splices a stroke before the closing />", () => {
    const out = addStrokeToPath('<path d="M0 0" fill="#fff"/>', "black", 2)
    expect(out).toBe('<path d="M0 0" fill="#fff" stroke="black" stroke-width="2"/>')
  })
  it("is idempotent when a stroke already exists", () => {
    const already = '<path d="M0 0" stroke="red" stroke-width="1"/>'
    expect(addStrokeToPath(already, "black", 2)).toBe(already)
  })
})

describe("buildLineartPreviewSvg", () => {
  const palette: PaletteChip[] = [
    { oklab: rgb255ToOklabTuple(200, 50, 50), rgb: [200, 50, 50], notation: "r", color_name: "Red" },
  ]

  it("wraps snapped + stroked regions in a viewBox'd <g id=regions>", () => {
    const vtracerSvg = '<svg><path d="M0 0 C1 1 2 2 3 3" fill="#c8322f"/></svg>'
    const { svg, indicesUsed } = buildLineartPreviewSvg({
      vtracerSvg,
      width: 40,
      height: 30,
      palette,
      strokeWidth: 0.5,
    })
    expect(svg).toContain('viewBox="0 0 40 30"')
    expect(svg).toContain('preserveAspectRatio="none"')
    expect(svg).toContain('<g id="regions">')
    expect(svg).toContain('fill="#c83232"') // snapped to palette red
    expect(svg).toContain('stroke="black" stroke-width="0.5"')
    expect(indicesUsed).toEqual([0])
  })
})
