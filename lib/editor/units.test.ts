import { describe, expect, it } from "vitest"

import { clampPx, clampPxFloat, pxToUnit, snapNearInt, unitToPx } from "./units"

describe("units", () => {
  it("unitToPx/pxToUnit roundtrip (cm @ 300dpi)", () => {
    const dpi = 300
    const cm = 20
    const px = unitToPx(cm, "cm", dpi)
    const cm2 = pxToUnit(px, "cm", dpi)
    expect(Math.abs(cm2 - cm)).toBeLessThan(0.01)
  })

  it("mm/cm/pt conversions behave at expected scale", () => {
    const dpi = 300
    expect(clampPx(unitToPx(25.4, "mm", dpi))).toBe(dpi) // 1 inch
    expect(clampPx(unitToPx(2.54, "cm", dpi))).toBe(dpi) // 1 inch
    expect(clampPx(unitToPx(72, "pt", dpi))).toBe(dpi) // 1 inch
  })

  it("clampPx never returns < 1", () => {
    expect(clampPx(0)).toBe(1)
    expect(clampPx(-10)).toBe(1)
  })

  it("clampPxFloat keeps decimals but never returns < 1", () => {
    expect(clampPxFloat(0)).toBe(1)
    expect(clampPxFloat(-10)).toBe(1)
    expect(clampPxFloat(12.3456)).toBeCloseTo(12.3456, 8)
  })

  it("snapNearInt snaps values extremely close to int", () => {
    expect(snapNearInt(199.9996, 1e-3)).toBe(200)
    expect(snapNearInt(200.0004, 1e-3)).toBe(200)
    expect(snapNearInt(199.99, 1e-3)).toBeCloseTo(199.99, 8)
  })
})

