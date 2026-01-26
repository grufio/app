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
})

