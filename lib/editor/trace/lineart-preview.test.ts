import { describe, expect, it } from "vitest"

import {
  addStrokeToPath,
  buildLineartPreviewSvg,
  extractPathElements,
  gaussianBlur,
  rgbaFromPaintMap,
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

describe("rgbaFromPaintMap", () => {
  const palette: PaletteChip[] = [
    { oklab: [0.5, 0.2, 0.1], rgb: [200, 50, 50], notation: "r", color_name: "Red" },
    { oklab: [0.5, -0.2, -0.1], rgb: [50, 50, 200], notation: "b", color_name: "Blue" },
  ]

  it("paints each pixel with its selected paint's EXACT chip RGB", () => {
    // 2x1: pixel 0 → chip 0 (red), pixel 1 → chip 1 (blue).
    const out = rgbaFromPaintMap({
      paintMap: Int32Array.from([0, 1]),
      palette,
      width: 2,
      height: 1,
    })
    expect(Array.from(out.slice(0, 4))).toEqual([200, 50, 50, 255])
    expect(Array.from(out.slice(4, 8))).toEqual([50, 50, 200, 255])
  })

  it("returns a zero buffer for an empty palette", () => {
    const out = rgbaFromPaintMap({ paintMap: Int32Array.from([0, 0]), palette: [], width: 2, height: 1 })
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
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
