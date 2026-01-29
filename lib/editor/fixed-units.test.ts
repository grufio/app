"use client"

/**
 * Unit tests for `lib/editor/fixed-units.ts`.
 *
 * Focus:
 * - Deterministic roundtrips at fixed precision across units and DPI.
 */
import { describe, expect, it } from "vitest"

import { pxToUnitDeterministic, unitToPxDeterministic } from "./fixed-units"
import { clampPx } from "./units"

describe("fixed-units", () => {
  it("round-trips exactly at 4dp (100mm @300dpi)", () => {
    const dpi = 300
    const mm = 100
    const px = unitToPxDeterministic(mm, "mm", dpi)
    const mm2 = pxToUnitDeterministic(px, "mm", dpi)
    expect(mm2.toFixed(4)).toBe("100.0000")
  })

  it("round-trips exactly at 4dp (20cm @300dpi)", () => {
    const dpi = 300
    const cm = 20
    const px = unitToPxDeterministic(cm, "cm", dpi)
    const cm2 = pxToUnitDeterministic(px, "cm", dpi)
    expect(cm2.toFixed(4)).toBe("20.0000")
  })

  it("1 inch equivalences (mm/cm/pt) -> ~dpi px", () => {
    const dpi = 300
    expect(clampPx(unitToPxDeterministic(25.4, "mm", dpi))).toBe(dpi)
    expect(clampPx(unitToPxDeterministic(2.54, "cm", dpi))).toBe(dpi)
    expect(clampPx(unitToPxDeterministic(72, "pt", dpi))).toBe(dpi)
  })

  it("supports deterministic custom DPI (254dpi) roundtrip at 4dp", () => {
    const dpi = 254
    const mm = 100
    const px = unitToPxDeterministic(mm, "mm", dpi)
    const mm2 = pxToUnitDeterministic(px, "mm", dpi)
    expect(mm2.toFixed(4)).toBe("100.0000")
  })
})

