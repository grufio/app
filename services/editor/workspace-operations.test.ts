/**
 * Unit tests for workspace operations.
 */
import { describe, expect, it } from "vitest"

import type { WorkspaceRow } from "./workspace/types"
import { computeLockedDimension, computeWorkspaceSizeSave, mapDpiToRasterPreset, normalizeUnit } from "./workspace-operations"

describe("workspace-operations", () => {
  it("normalizeUnit falls back to cm", () => {
    expect(normalizeUnit("mm")).toBe("mm")
    expect(normalizeUnit("nope")).toBe("cm")
    expect(normalizeUnit(undefined)).toBe("cm")
  })

  it("mapDpiToRasterPreset maps exact presets only", () => {
    expect(mapDpiToRasterPreset(300)).toBe("high")
    expect(mapDpiToRasterPreset(150)).toBe("medium")
    expect(mapDpiToRasterPreset(72)).toBe("low")
    expect(mapDpiToRasterPreset(299)).toBe(null)
  })

  it("computeLockedDimension uses ratio w/h", () => {
    expect(computeLockedDimension({ changedValue: 10, ratio: 2, changedAxis: "w" })).toBe(5)
    expect(computeLockedDimension({ changedValue: 10, ratio: 2, changedAxis: "h" })).toBe(20)
  })

  it("computeWorkspaceSizeSave returns next row + stable signature", () => {
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "cm",
      width_value: 20,
      height_value: 30,
      dpi_x: 300,
      dpi_y: 300,
      output_dpi_x: 300,
      output_dpi_y: 300,
      width_px_u: "0",
      height_px_u: "0",
      width_px: 1,
      height_px: 1,
      raster_effects_preset: "high",
    }

    const r1 = computeWorkspaceSizeSave({ base, unit: "cm", draftW: "20", draftH: "30" })
    if ("error" in r1) throw new Error("expected ok")
    const r2 = computeWorkspaceSizeSave({ base, unit: "cm", draftW: "20", draftH: "30" })
    if ("error" in r2) throw new Error("expected ok")

    expect(r1.signature).toBe(r2.signature)
    expect(r1.next.unit).toBe("cm")
    expect(typeof r1.next.width_px_u).toBe("string")
    expect(typeof r1.next.height_px_u).toBe("string")
  })

  it("computeWorkspaceSizeSave preserves output dpi fields", () => {
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "cm",
      width_value: 20,
      height_value: 30,
      dpi_x: 300,
      dpi_y: 300,
      output_dpi_x: 150,
      output_dpi_y: 150,
      width_px_u: "0",
      height_px_u: "0",
      width_px: 1,
      height_px: 1,
      raster_effects_preset: "medium",
    }

    const out = computeWorkspaceSizeSave({ base, unit: "cm", draftW: "20", draftH: "30" })
    if ("error" in out) throw new Error("expected ok")
    expect(out.next.output_dpi_x).toBe(150)
    expect(out.next.output_dpi_y).toBe(150)
    expect(out.next.dpi_x).toBe(300)
    expect(out.next.dpi_y).toBe(300)
  })
})

