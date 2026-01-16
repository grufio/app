import { describe, expect, it } from "vitest"

import { clampPx, pxToUnit, unitToPx } from "./units"

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
})

