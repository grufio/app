import { describe, expect, it } from "vitest"

import { computePaddingStripes } from "./padding-stripes"

describe("computePaddingStripes", () => {
  it("returns no stripes when padding is zero", () => {
    expect(computePaddingStripes(100, 200, { top: 0, bottom: 0, left: 0, right: 0 })).toEqual([])
  })

  it("returns no stripes for a non-positive artboard", () => {
    expect(computePaddingStripes(0, 200, { top: 5, bottom: 5, left: 5, right: 5 })).toEqual([])
  })

  it("covers corners exactly once (top/bottom full width, left/right middle band)", () => {
    const stripes = computePaddingStripes(100, 200, { top: 10, bottom: 20, left: 5, right: 8 })
    expect(stripes).toEqual([
      { key: "pad-top", x: 0, y: 0, width: 100, height: 10 },
      { key: "pad-bottom", x: 0, y: 180, width: 100, height: 20 },
      { key: "pad-left", x: 0, y: 10, width: 5, height: 170 },
      { key: "pad-right", x: 92, y: 10, width: 8, height: 170 },
    ])
  })

  it("omits a side whose padding is 0", () => {
    const stripes = computePaddingStripes(100, 100, { top: 10, bottom: 0, left: 0, right: 0 })
    expect(stripes).toEqual([{ key: "pad-top", x: 0, y: 0, width: 100, height: 10 }])
  })

  it("clamps padding larger than the artboard (no negative dimensions)", () => {
    const stripes = computePaddingStripes(100, 100, { top: 80, bottom: 80, left: 0, right: 0 })
    // top clamps to 80; bottom clamps to 100-80=20; middle band height = 0 → no left/right
    expect(stripes).toEqual([
      { key: "pad-top", x: 0, y: 0, width: 100, height: 80 },
      { key: "pad-bottom", x: 0, y: 80, width: 100, height: 20 },
    ])
    for (const s of stripes) {
      expect(s.width).toBeGreaterThanOrEqual(0)
      expect(s.height).toBeGreaterThanOrEqual(0)
    }
  })
})
