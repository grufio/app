import { describe, expect, it } from "vitest"

import { resolveTraceOverlayRect, resolveTraceWorldSize } from "./trace-overlay-rect"

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

describe("resolveTraceOverlayRect — POSITION + SIZE frozen (content-rect anchor)", () => {
  // Trace display_* = 283.46×566.93 px (2:1), frozen centre 297.5/421.0. A
  // content-rect trace is anchored to the artboard content rect, decoupled from
  // the live image (position AND size come from the frozen rect).
  const displayRect = {
    display_x_px_u: "297500000", // 297.5 px
    display_y_px_u: "421000000", // 421.0 px
    display_width_px_u: "283464567", // 283.46 px
    display_height_px_u: "566929134", // 566.93 px
  }

  it("POSITION = the frozen content-rect centre (NOT the image); SIZE = frozen", () => {
    // User moved + enlarged the base image after applying — the trace stays in
    // the content rect it converted, it does not follow the image.
    const imageRender = { x: 600, y: 200, width: 800, height: 800 }
    const rect = resolveTraceOverlayRect(displayRect, imageRender)!
    expect(rect).not.toBeNull()
    // Position is the frozen content-rect centre (297.5/421), NOT the image (600/200).
    expect(rect.x).toBeCloseTo(297.5, 4)
    expect(rect.y).toBeCloseTo(421, 4)
    // Size stays the frozen 283×567 (2:1) — NOT the 800×800 image size.
    expect(rect.width).toBeCloseTo(283.464567, 4)
    expect(rect.height).toBeCloseTo(566.929134, 4)
    expect(rect.width / rect.height).toBeCloseTo(0.5, 4)
  })

  it("SIZE stays frozen even when the image is later resized to a square (Assert C-2 at unit level)", () => {
    // The ~30-PR aspect bug: a later square resize must NOT drag the overlay
    // size/aspect toward 1:1. Position stays the frozen content-rect centre.
    const square = { x: 900, y: 900, width: 800, height: 800 }
    const rect = resolveTraceOverlayRect(displayRect, square)!
    expect(rect.x).toBeCloseTo(297.5, 4)
    expect(rect.y).toBeCloseTo(421, 4)
    expect(rect.width).toBeCloseTo(283.464567, 4)
    expect(rect.height).toBeCloseTo(566.929134, 4)
    // Aspect is the frozen 1:2, never the square image's 1:1.
    expect(rect.width / rect.height).not.toBeCloseTo(1, 1)
  })

  it("uses the frozen display_x/y even with a far-away live image", () => {
    const rect = resolveTraceOverlayRect(displayRect, { x: 999, y: 999, width: 100, height: 100 })!
    expect(rect.x).toBeCloseTo(297.5, 4)
    expect(rect.y).toBeCloseTo(421, 4)
    expect(rect.width).toBeCloseTo(283.464567, 4)
    expect(rect.height).toBeCloseTo(566.929134, 4)
  })

  it("legacy/lineart '0' rect → returns the live image rect unchanged (size AND position)", () => {
    const imageRender = { x: 600, y: 200, width: 800, height: 800 }
    const legacy = {
      display_x_px_u: "0",
      display_y_px_u: "0",
      display_width_px_u: "0",
      display_height_px_u: "0",
    }
    expect(resolveTraceOverlayRect(legacy, imageRender)).toEqual(imageRender)
  })

  it("returns null when neither a frozen size nor a live image is available", () => {
    const legacy = {
      display_x_px_u: "0",
      display_y_px_u: "0",
      display_width_px_u: "0",
      display_height_px_u: "0",
    }
    expect(resolveTraceOverlayRect(legacy, null)).toBeNull()
  })
})
