/**
 * Unit tests for `grid-lines`.
 *
 * Focus:
 * - Grid line generation and stride behavior under large counts.
 */
import { describe, expect, it } from "vitest"

import { computeGridLines } from "./grid-lines"

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
})

