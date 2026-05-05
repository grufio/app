import { describe, expect, it } from "vitest"

import { computeRenderableGrid } from "./validation"

import type { ProjectGridRow } from "@/services/editor/grid/types"

describe("computeRenderableGrid", () => {
  const baseRow: ProjectGridRow = {
    project_id: "p1",
    unit: "cm",
    spacing_value: 1,
    spacing_x_value: 1,
    spacing_y_value: 1,
    line_width_value: 35,
    color: "#000000",
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
      color: "rgba(0, 0, 0, 0.35)",
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
