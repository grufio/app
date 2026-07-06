import { describe, expect, it } from "vitest"

import { computeOutsideArtboardRects } from "./outside-artboard-veil"

// Artboard rect at origin with the given extent (the common case).
const ab = (w: number, h: number) => ({ left: 0, top: 0, right: w, bottom: h })

describe("computeOutsideArtboardRects", () => {
  it("returns no rects for a non-positive artboard", () => {
    expect(computeOutsideArtboardRects({ left: -50, top: -50, right: 150, bottom: 150 }, ab(0, 100))).toEqual([])
  })

  it("returns no rects for degenerate visible bounds", () => {
    expect(computeOutsideArtboardRects({ left: 0, top: 0, right: 0, bottom: 100 }, ab(100, 100))).toEqual([])
  })

  it("returns no rects when the artboard fills the whole viewport", () => {
    // Visible bounds exactly match the artboard → nothing outside.
    expect(computeOutsideArtboardRects({ left: 0, top: 0, right: 100, bottom: 100 }, ab(100, 100))).toEqual([])
  })

  it("frames the artboard, covering corners exactly once", () => {
    // Artboard 100×100 at origin, viewport 20px margin on every side.
    const rects = computeOutsideArtboardRects({ left: -20, top: -20, right: 120, bottom: 120 }, ab(100, 100))
    expect(rects).toEqual([
      { key: "veil-top", x: -20, y: -20, width: 140, height: 20 },
      { key: "veil-bottom", x: -20, y: 100, width: 140, height: 20 },
      { key: "veil-left", x: -20, y: 0, width: 20, height: 100 },
      { key: "veil-right", x: 100, y: 0, width: 20, height: 100 },
    ])
  })

  it("frames a non-origin (snapped) artboard rect", () => {
    // The caller may pass device-pixel-snapped edges slightly off the raw 0/W/H.
    const rects = computeOutsideArtboardRects(
      { left: -20, top: -20, right: 120, bottom: 120 },
      { left: 0.5, top: 0.5, right: 100.5, bottom: 100.5 },
    )
    expect(rects).toEqual([
      { key: "veil-top", x: -20, y: -20, width: 140, height: 20.5 },
      { key: "veil-bottom", x: -20, y: 100.5, width: 140, height: 19.5 },
      { key: "veil-left", x: -20, y: 0.5, width: 20.5, height: 100 },
      { key: "veil-right", x: 100.5, y: 0.5, width: 19.5, height: 100 },
    ])
  })

  it("veils the whole viewport when the artboard is fully off-screen", () => {
    // Artboard is entirely left of the viewport → everything visible is outside.
    const rects = computeOutsideArtboardRects({ left: 500, top: 0, right: 800, bottom: 200 }, ab(100, 100))
    const area = rects.reduce((sum, r) => sum + r.width * r.height, 0)
    expect(area).toBe((800 - 500) * (200 - 0))
  })

  it("omits sides where the artboard reaches the viewport edge", () => {
    // Viewport flush with the artboard on the left and top; margin only right/bottom.
    const rects = computeOutsideArtboardRects({ left: 0, top: 0, right: 130, bottom: 140 }, ab(100, 100))
    expect(rects.map((r) => r.key)).toEqual(["veil-bottom", "veil-right"])
  })
})
