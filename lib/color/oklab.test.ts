import { describe, expect, it } from "vitest"

import { nearestPaletteIndex, rgb255ToOklab, type Oklab } from "./oklab"

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
