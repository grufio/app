import { describe, expect, it } from "vitest"

import { computeRenderableGrid } from "./validation"

describe("computeRenderableGrid", () => {
  const baseRow = {
    project_id: "p1",
    unit: "cm",
    spacing_value: 1,
    spacing_x_value: 1,
    spacing_y_value: 1,
    line_width_value: 0.25,
    color: "#000000",
    opacity_pct: 35,
    visible: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }

  it("returns a render model with fixed 1px line width", () => {
    const out = computeRenderableGrid({
      row: baseRow,
      spacingXPx: 20,
      spacingYPx: 24,
      lineWidthPx: 0.4,
    })
    expect(out).toEqual({
      spacingXPx: 20,
      spacingYPx: 24,
      lineWidthPx: 1,
      color: "#000000",
    })
  })

  it("does not require line width input to be finite", () => {
    const out = computeRenderableGrid({
      row: baseRow,
      spacingXPx: 20,
      spacingYPx: 24,
      lineWidthPx: Number.NaN,
    })
    expect(out?.lineWidthPx).toBe(1)
  })
})
