/**
 * Unit tests for grid operations.
 */
import { describe, expect, it } from "vitest"

import type { ProjectGridRow } from "./types"
import { computeGridSaveSignature, computeGridUpsert } from "./operations"

describe("grid operations", () => {
  it("computeGridSaveSignature is stable", () => {
    const row: ProjectGridRow = {
      project_id: "p",
      unit: "cm",
      color: "#000000",
      spacing_value: 10,
      spacing_x_value: 10,
      spacing_y_value: 20,
      line_width_value: 1,
    }
    expect(computeGridSaveSignature(row)).toBe(computeGridSaveSignature(row))
  })

  it("computeGridUpsert keeps spacing_value in sync with spacing_x_value", () => {
    const base: ProjectGridRow = {
      project_id: "p",
      unit: "cm",
      color: "#000000",
      spacing_value: 5,
      spacing_x_value: 5,
      spacing_y_value: 5,
      line_width_value: 1,
    }
    const next: ProjectGridRow = {
      ...base,
      spacing_x_value: 12,
      spacing_y_value: 34,
    }
    const res = computeGridUpsert(next, base)
    expect(res.next.spacing_x_value).toBe(12)
    expect(res.next.spacing_value).toBe(12)
    expect(res.next.spacing_y_value).toBe(34)
  })
})

