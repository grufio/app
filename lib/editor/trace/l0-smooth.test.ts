import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { flattenToLam, l0Smooth } from "./l0-smooth"
import type { PreviewImage } from "./linerate-preview"

// Fixture generated from the server `_l0_smooth` (filter-service/app/linerate.py)
// on a fixed 28×20 structured image at flatten=0.25. Regenerate with the Python
// snippet in the PR description if the server algorithm changes.
type Fixture = { width: number; height: number; flatten: number; input: number[]; output: number[] }
const fixture: Fixture = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/l0-smooth.fixture.json"), "utf-8"),
)

function rgbToPreviewImage(rgb: number[], width: number, height: number): PreviewImage {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = rgb[i * 3]
    rgba[i * 4 + 1] = rgb[i * 3 + 1]
    rgba[i * 4 + 2] = rgb[i * 3 + 2]
    rgba[i * 4 + 3] = 255
  }
  return { width, height, rgba }
}

describe("flattenToLam", () => {
  it("mirrors the server _flatten_to_lam range", () => {
    expect(flattenToLam(0)).toBeCloseTo(0.002, 9)
    expect(flattenToLam(1)).toBeCloseTo(0.047, 9)
    expect(flattenToLam(0.25)).toBeCloseTo(0.01325, 9)
  })
})

describe("l0Smooth parity with the server", () => {
  it("matches the Python _l0_smooth output within tolerance", () => {
    const img = rgbToPreviewImage(fixture.input, fixture.width, fixture.height)
    const out = l0Smooth(img, fixture.flatten)

    let sumAbs = 0
    let maxAbs = 0
    let count = 0
    for (let i = 0; i < fixture.width * fixture.height; i += 1) {
      for (let c = 0; c < 3; c += 1) {
        const got = out.rgba[i * 4 + c]
        const want = fixture.output[i * 3 + c]
        const d = Math.abs(got - want)
        sumAbs += d
        if (d > maxAbs) maxAbs = d
        count += 1
      }
    }
    const meanAbs = sumAbs / count
    // Same algorithm; JS float FFT ≠ numpy so allow a few levels of drift.
    expect(meanAbs).toBeLessThan(1.5)
    expect(maxAbs).toBeLessThan(8)
  })

  it("actually flattens — output has far less local variance than the input", () => {
    const img = rgbToPreviewImage(fixture.input, fixture.width, fixture.height)
    const out = l0Smooth(img, fixture.flatten)
    const localVar = (buf: ArrayLike<number>, stride: number): number => {
      // mean squared horizontal neighbour difference on channel 0
      let s = 0
      let k = 0
      for (let y = 0; y < fixture.height; y += 1) {
        for (let x = 1; x < fixture.width; x += 1) {
          const a = buf[(y * fixture.width + x) * stride]
          const b = buf[(y * fixture.width + x - 1) * stride]
          s += (a - b) * (a - b)
          k += 1
        }
      }
      return s / k
    }
    const inVar = localVar(img.rgba, 4)
    const outVar = localVar(out.rgba, 4)
    expect(outVar).toBeLessThan(inVar * 0.7)
  })
})
