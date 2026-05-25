import { describe, expect, it } from "vitest"

import { nearestPaletteIndex, rgb255ToOklab, rotateHueOklab, type Oklab } from "./oklab"

// Shared parity vectors — these SAME numbers are asserted in the Python
// mirror `filter-service/tests/test_oklab.py`. If client and server ever
// diverge, one side fails against these. The expected OKLab values are
// Ottosson reference values (white → [1,0,0]; red → [0.6280, 0.2249,
// 0.1258], etc.), inherited from color-lab's `colour`-validated transform.
const PROBES: ReadonlyArray<{ rgb: [number, number, number]; oklab: Oklab }> = [
  { rgb: [255, 255, 255], oklab: [1.0, 0.0, 0.0] },
  { rgb: [0, 0, 0], oklab: [0.0, 0.0, 0.0] },
  { rgb: [255, 0, 0], oklab: [0.627955, 0.224863, 0.125846] },
  { rgb: [0, 255, 0], oklab: [0.86644, -0.233888, 0.179498] },
  { rgb: [0, 0, 255], oklab: [0.452014, -0.032457, -0.311528] },
  { rgb: [128, 128, 128], oklab: [0.599871, 0.0, 0.0] },
  { rgb: [100, 150, 200], oklab: [0.657972, -0.032513, -0.086445] },
]

// Small palette (RGB chips) + the nearest-index each probe maps to. Mirror
// of the Python test. Indices are deterministic squared-OKLab argmin.
const CHIP_RGB: ReadonlyArray<[number, number, number]> = [
  [0, 0, 0],
  [255, 255, 255],
  [200, 0, 0],
  [0, 120, 0],
  [40, 40, 200],
]
const EXPECTED_NEAREST = [1, 0, 2, 1, 4, 3, 3]

describe("rgb255ToOklab — Ottosson reference vectors (server parity)", () => {
  it("matches the shared OKLab reference values to 5 decimals", () => {
    for (const { rgb, oklab } of PROBES) {
      const got = rgb255ToOklab(rgb[0], rgb[1], rgb[2])
      expect(got[0], `L for ${rgb}`).toBeCloseTo(oklab[0], 5)
      expect(got[1], `a for ${rgb}`).toBeCloseTo(oklab[1], 5)
      expect(got[2], `b for ${rgb}`).toBeCloseTo(oklab[2], 5)
    }
  })

  it("black → [0,0,0] exactly; white → [1,0,0] within float epsilon", () => {
    expect(rgb255ToOklab(0, 0, 0)).toEqual([0, 0, 0])
    const w = rgb255ToOklab(255, 255, 255)
    expect(w[0]).toBeCloseTo(1, 6)
    expect(w[1]).toBeCloseTo(0, 6)
    expect(w[2]).toBeCloseTo(0, 6)
  })
})

describe("nearestPaletteIndex — deterministic argmin (server parity)", () => {
  it("maps each probe to the same chip as the Python mirror", () => {
    const palette: Oklab[] = CHIP_RGB.map((c) => rgb255ToOklab(c[0], c[1], c[2]))
    const got = PROBES.map(({ rgb }) =>
      nearestPaletteIndex(rgb255ToOklab(rgb[0], rgb[1], rgb[2]), palette),
    )
    expect(got).toEqual(EXPECTED_NEAREST)
  })
})

describe("rotateHueOklab — OKLCh hue rotation (server parity)", () => {
  it("0° is the identity", () => {
    const lab = rgb255ToOklab(200, 30, 40)
    const out = rotateHueOklab(lab, 0)
    expect(out[0]).toBeCloseTo(lab[0], 12)
    expect(out[1]).toBeCloseTo(lab[1], 12)
    expect(out[2]).toBeCloseTo(lab[2], 12)
  })

  it("360° is the identity (full turn)", () => {
    const lab = rgb255ToOklab(130, 90, 200)
    const out = rotateHueOklab(lab, 360)
    expect(out[0]).toBeCloseTo(lab[0], 9)
    expect(out[1]).toBeCloseTo(lab[1], 9)
    expect(out[2]).toBeCloseTo(lab[2], 9)
  })

  it("preserves lightness + chroma and advances the hue by the given degrees", () => {
    const lab = rgb255ToOklab(200, 30, 40)
    const rotated = rotateHueOklab(lab, 73)
    expect(rotated[0]).toBeCloseTo(lab[0], 12) // L unchanged
    const chromaIn = Math.hypot(lab[1], lab[2])
    const chromaOut = Math.hypot(rotated[1], rotated[2])
    expect(chromaOut).toBeCloseTo(chromaIn, 12) // chroma preserved
    const hueIn = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI
    const hueOut = (Math.atan2(rotated[2], rotated[1]) * 180) / Math.PI
    // Wrap the delta into (-180, 180] before comparing to the +73° shift.
    const delta = ((hueOut - hueIn + 180) % 360) - 180
    expect(delta).toBeCloseTo(73, 6)
  })
})
