/**
 * Unit tests for `lib/editor/units.ts`.
 *
 * Focus:
 * - µpx-based conversions stay stable across roundtrips under fixed
 *   1px = 1/72 inch mapping (Illustrator-style geometry; the artboard
 *   has no DPI).
 */
import { describe, expect, it } from "vitest"

import { convertUnitFixed, pxUToUnitDisplayFixed, unitToPxUFixed } from "./units"

describe("units", () => {
  it("convertUnitFixed uses µpx so 10 cm → 100 mm exactly", () => {
    expect(convertUnitFixed("10", "cm", "mm")).toBe("100")
    expect(convertUnitFixed("100", "mm", "cm")).toBe("10")
  })

  it("100mm display roundtrip is exact", () => {
    const pxU = unitToPxUFixed("100", "mm")
    expect(pxUToUnitDisplayFixed(pxU, "mm")).toBe("100")
  })

  it("roundtrip stays stable with µpx", () => {
    const pxU = unitToPxUFixed("100", "mm")
    const display = pxUToUnitDisplayFixed(pxU, "mm")
    const pxU2 = unitToPxUFixed(display, "mm")
    expect(pxU2).toBe(pxU)
  })

  it("unit toggle does not change canonical µpx", () => {
    const pxU = unitToPxUFixed("100", "mm")
    const asCm = pxUToUnitDisplayFixed(pxU, "cm")
    const pxU2 = unitToPxUFixed(asCm, "cm")
    expect(pxU2).toBe(pxU)
  })

  it("toggle sequence preserves canonical µpx", () => {
    const pxU = unitToPxUFixed("123.45", "mm")
    const mm = pxUToUnitDisplayFixed(pxU, "mm")
    const cm = pxUToUnitDisplayFixed(unitToPxUFixed(mm, "mm"), "cm")
    const pt = pxUToUnitDisplayFixed(unitToPxUFixed(cm, "cm"), "pt")
    const px = pxUToUnitDisplayFixed(unitToPxUFixed(pt, "pt"), "px")
    const mm2 = pxUToUnitDisplayFixed(unitToPxUFixed(px, "px"), "mm")
    const pxU2 = unitToPxUFixed(mm2, "mm")
    expect(pxU2).toBe(pxU)
  })

  it("stress: display->parse->display is stable (no oscillation)", () => {
    const units = ["mm", "cm", "pt", "px"] as const

    // Deterministic PRNG (LCG) so the test is stable.
    let seed = 0x1234abcd
    const nextU32 = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed
    }

    // Generate decimal strings with up to 4 dp (matches display rule).
    const makeValue = () => {
      const intPart = (nextU32() % 5000) + 1 // 1..5000
      const dp = nextU32() % 5 // 0..4
      if (dp === 0) return String(intPart)
      const frac = String(nextU32() % 10 ** dp).padStart(dp, "0")
      return `${intPart}.${frac}`
    }

    for (let i = 0; i < 500; i += 1) {
      const unit = units[nextU32() % units.length]
      const input = makeValue()
      const pxU = unitToPxUFixed(input, unit)
      const display1 = pxUToUnitDisplayFixed(pxU, unit)
      const pxU2 = unitToPxUFixed(display1, unit)
      const display2 = pxUToUnitDisplayFixed(pxU2, unit)
      expect(display2).toBe(display1)
    }
  })

  it("fixed mapping: 1in = 72pt, 25.4mm, and 1px = 1pt", () => {
    const oneInInMm = "25.4"
    const pxU = unitToPxUFixed(oneInInMm, "mm")
    expect(pxUToUnitDisplayFixed(pxU, "pt")).toBe("72")
    expect(pxUToUnitDisplayFixed(pxU, "px")).toBe("72")
  })
})
