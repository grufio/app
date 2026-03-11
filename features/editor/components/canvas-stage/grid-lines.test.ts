/**
 * Unit tests for `grid-lines`.
 *
 * Focus:
 * - Grid line generation and stride behavior under large counts.
 */
import { describe, expect, it } from "vitest"

import { computeGridLines, snapGridLinesToDevicePixels } from "./grid-lines"

describe("computeGridLines", () => {
  it("returns null for invalid inputs", () => {
    expect(computeGridLines({ artW: 0, artH: 100, grid: { spacingXPx: 10, spacingYPx: 10, lineWidthPx: 1, color: "#000" }, maxLines: 600 })).toBe(
      null
    )
    expect(computeGridLines({ artW: 100, artH: 100, grid: { spacingXPx: 0, spacingYPx: 10, lineWidthPx: 1, color: "#000" }, maxLines: 600 })).toBe(
      null
    )
    expect(
      computeGridLines({ artW: 100, artH: 100, grid: { spacingXPx: 10, spacingYPx: 10, lineWidthPx: 0, color: "#000" }, maxLines: 600 })
    ).toBe(null)
  })

  it("computes expected line count for small artboards", () => {
    const out = computeGridLines({
      artW: 100,
      artH: 100,
      grid: { spacingXPx: 10, spacingYPx: 10, lineWidthPx: 1, color: "rgba(0,0,0,0.2)" },
      maxLines: 600,
    })
    expect(out).not.toBeNull()
    expect(out!.lines.length).toBe(22) // 11 vertical + 11 horizontal (inclusive endpoints)
    expect(out!.strokeWidth).toBe(1)
    expect(out!.stroke).toBe("rgba(0,0,0,0.2)")
  })

  it("applies stride when grid would exceed maxLines", () => {
    const out = computeGridLines({
      artW: 20_000,
      artH: 20_000,
      grid: { spacingXPx: 1, spacingYPx: 1, lineWidthPx: 1, color: "#000" },
      maxLines: 600,
    })
    expect(out).not.toBeNull()
    // Stride is chosen to cap total line count roughly at maxLines.
    expect(out!.lines.length).toBeLessThanOrEqual(650)
  })

  it("snaps vertical and horizontal lines via provided pixel snap function", () => {
    const base = computeGridLines({
      artW: 100,
      artH: 100,
      grid: { spacingXPx: 10, spacingYPx: 10, lineWidthPx: 1, color: "#000" },
      maxLines: 600,
    })
    expect(base).not.toBeNull()

    const snapped = snapGridLinesToDevicePixels({
      gridLines: base,
      snapWorldToDeviceHalfPixel: (worldCoord, axis) => (axis === "x" ? worldCoord + 0.5 : worldCoord + 0.25),
    })
    expect(snapped).not.toBeNull()

    const firstVertical = snapped!.lines.find((line) => line.key === "vx:0")
    const firstHorizontal = snapped!.lines.find((line) => line.key === "hy:0")
    expect(firstVertical?.points).toEqual([0.5, 0, 0.5, 100])
    expect(firstHorizontal?.points).toEqual([0, 0.25, 100, 0.25])
  })

  it("returns null when snapping receives null grid", () => {
    const out = snapGridLinesToDevicePixels({
      gridLines: null,
      snapWorldToDeviceHalfPixel: (worldCoord) => worldCoord,
    })
    expect(out).toBeNull()
  })

})

