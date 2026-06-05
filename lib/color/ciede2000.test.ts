/**
 * CIEDE2000 parity test (client side). The SAME 34 reference pairs are
 * asserted in the Python mirror `filter-service/tests/test_ciede2000.py`.
 *
 * Reference values from Sharma, Wu, Dalal (2005), Table I:
 * "The CIEDE2000 Color-Difference Formula: Implementation Notes,
 * Supplementary Test Data, and Mathematical Observations."
 */
import { describe, expect, it } from "vitest"

import {
  ciede2000,
  nearestPaletteIndexCiede2000,
  rgb255ToCielab,
  type CieLab,
} from "./ciede2000"

// Sharma 2005 Table I — all 34 pairs. (lab1, lab2, expected ΔE00).
const SHARMA_PAIRS: ReadonlyArray<{ lab1: CieLab; lab2: CieLab; expected: number }> = [
  { lab1: [50.0, 2.6772, -79.7751], lab2: [50.0, 0.0, -82.7485], expected: 2.0425 },
  { lab1: [50.0, 3.1571, -77.2803], lab2: [50.0, 0.0, -82.7485], expected: 2.8615 },
  { lab1: [50.0, 2.8361, -74.02], lab2: [50.0, 0.0, -82.7485], expected: 3.4412 },
  { lab1: [50.0, -1.3802, -84.2814], lab2: [50.0, 0.0, -82.7485], expected: 1.0 },
  { lab1: [50.0, -1.1848, -84.8006], lab2: [50.0, 0.0, -82.7485], expected: 1.0 },
  { lab1: [50.0, -0.9009, -85.5211], lab2: [50.0, 0.0, -82.7485], expected: 1.0 },
  { lab1: [50.0, 0.0, 0.0], lab2: [50.0, -1.0, 2.0], expected: 2.3669 },
  { lab1: [50.0, -1.0, 2.0], lab2: [50.0, 0.0, 0.0], expected: 2.3669 },
  { lab1: [50.0, 2.49, -0.001], lab2: [50.0, -2.49, 0.0009], expected: 7.1792 },
  { lab1: [50.0, 2.49, -0.001], lab2: [50.0, -2.49, 0.001], expected: 7.1792 },
  { lab1: [50.0, 2.49, -0.001], lab2: [50.0, -2.49, 0.0011], expected: 7.2195 },
  { lab1: [50.0, 2.49, -0.001], lab2: [50.0, -2.49, 0.0012], expected: 7.2195 },
  { lab1: [50.0, -0.001, 2.49], lab2: [50.0, 0.0009, -2.49], expected: 4.8045 },
  { lab1: [50.0, -0.001, 2.49], lab2: [50.0, 0.001, -2.49], expected: 4.8045 },
  { lab1: [50.0, -0.001, 2.49], lab2: [50.0, 0.0011, -2.49], expected: 4.7461 },
  { lab1: [50.0, 2.5, 0.0], lab2: [50.0, 0.0, -2.5], expected: 4.3065 },
  { lab1: [50.0, 2.5, 0.0], lab2: [73.0, 25.0, -18.0], expected: 27.1492 },
  { lab1: [50.0, 2.5, 0.0], lab2: [61.0, -5.0, 29.0], expected: 22.8977 },
  { lab1: [50.0, 2.5, 0.0], lab2: [56.0, -27.0, -3.0], expected: 31.903 },
  { lab1: [50.0, 2.5, 0.0], lab2: [58.0, 24.0, 15.0], expected: 19.4535 },
  { lab1: [50.0, 2.5, 0.0], lab2: [50.0, 3.1736, 0.5854], expected: 1.0 },
  { lab1: [50.0, 2.5, 0.0], lab2: [50.0, 3.2972, 0.0], expected: 1.0 },
  { lab1: [50.0, 2.5, 0.0], lab2: [50.0, 1.8634, 0.5757], expected: 1.0 },
  { lab1: [50.0, 2.5, 0.0], lab2: [50.0, 3.2592, 0.335], expected: 1.0 },
  { lab1: [60.2574, -34.0099, 36.2677], lab2: [60.4626, -34.1751, 39.4387], expected: 1.2644 },
  { lab1: [63.0109, -31.0961, -5.8663], lab2: [62.8187, -29.7946, -4.0864], expected: 1.263 },
  { lab1: [61.2901, 3.7196, -5.3901], lab2: [61.4292, 2.248, -4.962], expected: 1.8731 },
  { lab1: [35.0831, -44.1164, 3.7933], lab2: [35.0232, -40.0716, 1.5901], expected: 1.8645 },
  { lab1: [22.7233, 20.0904, -46.694], lab2: [23.0331, 14.973, -42.5619], expected: 2.0373 },
  { lab1: [36.4612, 47.858, 18.3852], lab2: [36.2715, 50.5065, 21.2231], expected: 1.4146 },
  { lab1: [90.8027, -2.0831, 1.441], lab2: [91.1528, -1.6435, 0.0447], expected: 1.4441 },
  { lab1: [90.9257, -0.5406, -0.9208], lab2: [88.6381, -0.8985, -0.7239], expected: 1.5381 },
  { lab1: [6.7747, -0.2908, -2.4247], lab2: [5.8714, -0.0985, -2.2286], expected: 0.6377 },
  { lab1: [2.0776, 0.0795, -1.135], lab2: [0.9033, -0.0636, -0.5514], expected: 0.9082 },
]

// sRGB → CIE Lab D65 reference values, identical to
// `filter-service/tests/test_ciede2000.py::CIELAB_PROBES`.
const CIELAB_PROBES: ReadonlyArray<{ rgb: [number, number, number]; lab: CieLab }> = [
  { rgb: [255, 255, 255], lab: [100.0, 0.0, 0.0] },
  { rgb: [0, 0, 0], lab: [0.0, 0.0, 0.0] },
  { rgb: [255, 0, 0], lab: [53.2408, 80.0925, 67.2032] },
  { rgb: [0, 255, 0], lab: [87.7347, -86.1827, 83.1793] },
  { rgb: [0, 0, 255], lab: [32.297, 79.1875, -107.8602] },
  { rgb: [128, 128, 128], lab: [53.585, 0.0, 0.0] },
  { rgb: [100, 150, 200], lab: [60.5072, -2.7871, -30.9306] },
]

describe("ciede2000 — Sharma 2005 Table I (server parity)", () => {
  it("matches all 34 reference pairs to 4 decimals", () => {
    for (let i = 0; i < SHARMA_PAIRS.length; i += 1) {
      const { lab1, lab2, expected } = SHARMA_PAIRS[i]
      const got = ciede2000(lab1, lab2)
      expect(got, `pair ${i + 1}`).toBeCloseTo(expected, 4)
    }
  })

  it("is symmetric: ΔE00(a, b) == ΔE00(b, a) for every Sharma pair", () => {
    for (const { lab1, lab2 } of SHARMA_PAIRS) {
      const d12 = ciede2000(lab1, lab2)
      const d21 = ciede2000(lab2, lab1)
      expect(d21).toBeCloseTo(d12, 10)
    }
  })

  it("returns 0 for identical colours (covers a/b≈0, neutral, vivid)", () => {
    for (const { lab1 } of SHARMA_PAIRS) {
      expect(ciede2000(lab1, lab1)).toBeLessThan(1e-10)
    }
  })
})

describe("rgb255ToCielab — sRGB → CIE Lab D65 (server parity)", () => {
  it("matches the shared reference values to 3 decimals", () => {
    for (const { rgb, lab } of CIELAB_PROBES) {
      const got = rgb255ToCielab(rgb[0], rgb[1], rgb[2])
      expect(got[0], `L for ${rgb}`).toBeCloseTo(lab[0], 3)
      expect(got[1], `a for ${rgb}`).toBeCloseTo(lab[1], 3)
      expect(got[2], `b for ${rgb}`).toBeCloseTo(lab[2], 3)
    }
  })

  it("black → [0,0,0] exactly; white → L ≈ 100 within float epsilon", () => {
    expect(rgb255ToCielab(0, 0, 0)).toEqual([0, 0, 0])
    const w = rgb255ToCielab(255, 255, 255)
    expect(w[0]).toBeCloseTo(100, 4)
    expect(w[1]).toBeCloseTo(0, 4)
    expect(w[2]).toBeCloseTo(0, 4)
  })
})

describe("nearestPaletteIndexCiede2000 — argmin by CIEDE2000 distance", () => {
  it("returns the same index as a per-pair argmin over the palette", () => {
    // Constructed palette: black, white, vivid red, dark green, deep blue.
    // The actual indices depend on CIEDE2000's perceptual weighting
    // (which differs from naive Lab Euclidean — notably the L-axis
    // weighting), so the contract is "linear-scan == per-pair argmin"
    // rather than a hard-coded list.
    const palette: CieLab[] = (
      [
        [0, 0, 0],
        [255, 255, 255],
        [200, 0, 0],
        [0, 120, 0],
        [40, 40, 200],
      ] as ReadonlyArray<[number, number, number]>
    ).map(([r, g, b]) => rgb255ToCielab(r, g, b))
    const probes = CIELAB_PROBES.map(({ rgb }) => rgb255ToCielab(rgb[0], rgb[1], rgb[2]))
    for (const probe of probes) {
      const scan = nearestPaletteIndexCiede2000(probe, palette)
      const perPair = palette
        .map((c, i) => ({ d: ciede2000(probe, c), i }))
        .reduce((best, x) => (x.d < best.d ? x : best)).i
      expect(scan).toBe(perPair)
    }
  })
})
