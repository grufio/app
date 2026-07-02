import { describe, expect, it } from "vitest"

import { computeContentRegionPlan } from "./content-region"

const base = {
  artboardWPx: 100,
  artboardHPx: 100,
  padding: { topPx: 0, bottomPx: 0, leftPx: 0, rightPx: 0 },
  image: { leftPx: 0, topPx: 0, widthPx: 100, heightPx: 100 },
  intrinsicWPx: 200,
  intrinsicHPx: 200,
}

describe("computeContentRegionPlan", () => {
  it("fails for a degenerate content rect (padding too large)", () => {
    const res = computeContentRegionPlan({
      ...base,
      padding: { topPx: 0, bottomPx: 0, leftPx: 60, rightPx: 60 },
    })
    expect(res.ok).toBe(false)
  })

  it("full coverage: image fills the artboard, padding insets the content rect", () => {
    // artboard 100, padding 10 → content 80×80 @ 10,10. Image fills artboard,
    // intrinsic 200 → density 2 → canvas 160×160.
    const res = computeContentRegionPlan({ ...base, padding: { topPx: 10, bottomPx: 10, leftPx: 10, rightPx: 10 } })
    expect(res).toEqual({
      ok: true,
      contentRectPx: { xPx: 10, yPx: 10, widthPx: 80, heightPx: 80 },
      canvasPx: { widthPx: 160, heightPx: 160 },
      composite: { extract: { left: 20, top: 20, width: 160, height: 160 }, placeAt: { left: 0, top: 0 } },
      coverage: "full",
    })
  })

  it("partial coverage: image smaller than the content rect → white around it", () => {
    // content rect 100×100 (no padding). Image 50×50 centred, intrinsic 50 (density 1).
    const res = computeContentRegionPlan({
      ...base,
      image: { leftPx: 25, topPx: 25, widthPx: 50, heightPx: 50 },
      intrinsicWPx: 50,
      intrinsicHPx: 50,
    })
    if (!res.ok) throw new Error("expected ok")
    expect(res.coverage).toBe("partial")
    expect(res.canvasPx).toEqual({ widthPx: 100, heightPx: 100 })
    expect(res.composite).toEqual({
      extract: { left: 0, top: 0, width: 50, height: 50 },
      placeAt: { left: 25, top: 25 },
    })
  })

  it("no coverage: image lies entirely outside the content rect → all white", () => {
    // content rect 20×20 @ 40,40 (padding 40). Image covers 0..30 → no overlap.
    const res = computeContentRegionPlan({
      ...base,
      padding: { topPx: 40, bottomPx: 40, leftPx: 40, rightPx: 40 },
      image: { leftPx: 0, topPx: 0, widthPx: 30, heightPx: 30 },
      intrinsicWPx: 30,
      intrinsicHPx: 30,
    })
    if (!res.ok) throw new Error("expected ok")
    expect(res.coverage).toBe("none")
    expect(res.composite).toBeNull()
  })

  it("partial coverage: image extends past one edge only", () => {
    // content rect 100×100. Image shifted right so its left edge is inside.
    const res = computeContentRegionPlan({
      ...base,
      image: { leftPx: 20, topPx: 0, widthPx: 100, heightPx: 100 },
      intrinsicWPx: 100,
      intrinsicHPx: 100,
    })
    if (!res.ok) throw new Error("expected ok")
    // left edge at 20 (uncovered strip 0..20 → white), right edge past 100.
    expect(res.coverage).toBe("partial")
    expect(res.composite?.placeAt).toEqual({ left: 20, top: 0 })
    expect(res.composite?.extract).toEqual({ left: 0, top: 0, width: 80, height: 100 })
  })
})
