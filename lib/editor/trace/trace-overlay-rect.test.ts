import { describe, expect, it } from "vitest"

import { resolveTraceWorldSize } from "./trace-overlay-rect"

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
