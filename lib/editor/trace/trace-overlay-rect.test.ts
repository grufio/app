import { describe, expect, it } from "vitest"

import { resolveTraceClipRect, resolveTraceOverlayRect, resolveTraceWorldSize } from "./trace-overlay-rect"

describe("resolveTraceWorldSize", () => {
  it("converts the frozen display rect (µpx) to world px (÷1e6)", () => {
    // 200mm × 100mm at GEOMETRY_PPI=72 in µpx → arbitrary positive µpx; the
    // unit under test is the conversion + the 2:1 aspect, not the mm math.
    const size = resolveTraceWorldSize({
      display_x_px_u: "0",
      display_y_px_u: "0",
      display_width_px_u: "566929134", // ~566.93 px
      display_height_px_u: "283464567", // ~283.46 px → exactly half
    })
    expect(size).not.toBeNull()
    expect(size!.width).toBeCloseTo(566.929134, 5)
    expect(size!.height).toBeCloseTo(283.464567, 5)
    // The whole point: a 2:1 frozen aspect survives, decoupled from imageTx.
    expect(size!.width / size!.height).toBeCloseTo(2, 5)
  })

  it("returns null for the legacy/lineart '0' signal (width = 0)", () => {
    expect(
      resolveTraceWorldSize({
        display_x_px_u: "0",
        display_y_px_u: "0",
        display_width_px_u: "0",
        display_height_px_u: "0",
      }),
    ).toBeNull()
  })

  it("returns null when only one dimension is the '0' signal", () => {
    expect(
      resolveTraceWorldSize({
        display_x_px_u: "0",
        display_y_px_u: "0",
        display_width_px_u: "566929134",
        display_height_px_u: "0",
      }),
    ).toBeNull()
  })

  it("returns null for null/garbage/negative input", () => {
    expect(resolveTraceWorldSize(null)).toBeNull()
    expect(resolveTraceWorldSize(undefined)).toBeNull()
    expect(
      resolveTraceWorldSize({
        display_x_px_u: "0",
        display_y_px_u: "0",
        display_width_px_u: "not-a-number",
        display_height_px_u: "283464567",
      }),
    ).toBeNull()
    expect(
      resolveTraceWorldSize({
        display_x_px_u: "0",
        display_y_px_u: "0",
        display_width_px_u: "-100",
        display_height_px_u: "283464567",
      }),
    ).toBeNull()
  })
})

describe("resolveTraceOverlayRect — frozen content-rect anchor", () => {
  // display_* = 283.46×566.93 px (2:1), frozen centre 297.5/421.0. The trace is
  // anchored to the artboard content rect — position AND size come from the
  // frozen rect, decoupled from the base image.
  const displayRect = {
    display_x_px_u: "297500000", // 297.5 px
    display_y_px_u: "421000000", // 421.0 px
    display_width_px_u: "283464567", // 283.46 px
    display_height_px_u: "566929134", // 566.93 px
  }

  it("returns the frozen centre + size (anchored to the content rect)", () => {
    const rect = resolveTraceOverlayRect(displayRect)!
    expect(rect).not.toBeNull()
    expect(rect.x).toBeCloseTo(297.5, 4)
    expect(rect.y).toBeCloseTo(421, 4)
    expect(rect.width).toBeCloseTo(283.464567, 4)
    expect(rect.height).toBeCloseTo(566.929134, 4)
    // Frozen 1:2 aspect (never the base image's aspect).
    expect(rect.width / rect.height).toBeCloseTo(0.5, 4)
  })

  it("returns null for a '0'/invalid rect (nothing to render)", () => {
    expect(
      resolveTraceOverlayRect({
        display_x_px_u: "0",
        display_y_px_u: "0",
        display_width_px_u: "0",
        display_height_px_u: "0",
      }),
    ).toBeNull()
    expect(resolveTraceOverlayRect(null)).toBeNull()
  })
})

describe("resolveTraceClipRect — base-bitmap clip == overlay content rect", () => {
  const displayRect = {
    display_x_px_u: "297500000", // centre 297.5 px
    display_y_px_u: "421000000", // centre 421.0 px
    display_width_px_u: "283464567", // 283.46 px
    display_height_px_u: "566929134", // 566.93 px
  }

  it("returns the SAME frozen rect as the overlay, corner-anchored (centre − extent/2)", () => {
    const overlay = resolveTraceOverlayRect(displayRect)!
    const clip = resolveTraceClipRect(displayRect)!
    expect(clip).not.toBeNull()
    // Size is identical to the overlay; position is the top-left corner.
    expect(clip.width).toBeCloseTo(overlay.width, 4)
    expect(clip.height).toBeCloseTo(overlay.height, 4)
    expect(clip.x).toBeCloseTo(overlay.x - overlay.width / 2, 4)
    expect(clip.y).toBeCloseTo(overlay.y - overlay.height / 2, 4)
    expect(clip.x).toBeCloseTo(155.7677165, 4)
    expect(clip.y).toBeCloseTo(137.535433, 4)
  })

  it("returns null when there is no trace (nothing to clip)", () => {
    expect(resolveTraceClipRect(null)).toBeNull()
    expect(
      resolveTraceClipRect({
        display_x_px_u: "0",
        display_y_px_u: "0",
        display_width_px_u: "0",
        display_height_px_u: "0",
      }),
    ).toBeNull()
  })
})
