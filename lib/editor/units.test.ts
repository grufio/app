import { describe, expect, it } from "vitest"

import { pxUToUnitDisplay, unitToPxU } from "./units"

describe("units", () => {
  it("100mm@300dpi displays exactly 100", () => {
    const dpi = 300
    const pxU = unitToPxU("100", "mm", dpi)
    const display = pxUToUnitDisplay(pxU, "mm", dpi)
    expect(display).toBe("100")
  })

  it("roundtrip stays stable with µpx", () => {
    const dpi = 300
    const pxU = unitToPxU("100", "mm", dpi)
    const display = pxUToUnitDisplay(pxU, "mm", dpi)
    const pxU2 = unitToPxU(display, "mm", dpi)
    expect(pxU2).toBe(pxU)
  })

  it("unit toggle does not change canonical µpx", () => {
    const dpi = 300
    const pxU = unitToPxU("100", "mm", dpi)
    const asCm = pxUToUnitDisplay(pxU, "cm", dpi)
    const pxU2 = unitToPxU(asCm, "cm", dpi)
    expect(pxU2).toBe(pxU)
  })

  it("toggle sequence preserves canonical µpx", () => {
    const dpi = 300
    const pxU = unitToPxU("123.45", "mm", dpi)
    const mm = pxUToUnitDisplay(pxU, "mm", dpi)
    const cm = pxUToUnitDisplay(unitToPxU(mm, "mm", dpi), "cm", dpi)
    const pt = pxUToUnitDisplay(unitToPxU(cm, "cm", dpi), "pt", dpi)
    const px = pxUToUnitDisplay(unitToPxU(pt, "pt", dpi), "px", dpi)
    const mm2 = pxUToUnitDisplay(unitToPxU(px, "px", dpi), "mm", dpi)
    const pxU2 = unitToPxU(mm2, "mm", dpi)
    expect(pxU2).toBe(pxU)
  })

  it("stress: display->parse->display is stable (no oscillation)", () => {
    const dpi = 300
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
      const pxU = unitToPxU(input, unit, dpi)
      const display1 = pxUToUnitDisplay(pxU, unit, dpi)
      const pxU2 = unitToPxU(display1, unit, dpi)
      const display2 = pxUToUnitDisplay(pxU2, unit, dpi)
      expect(display2).toBe(display1)
    }
  })
})

