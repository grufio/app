/**
 * Unit tests for workspace operations.
 */
import { describe, expect, it } from "vitest"

import type { WorkspaceRow } from "./workspace/types"
import {
  computeLockedDimension,
  computeWorkspaceSizeSave,
  computeWorkspaceUnitChange,
  normalizeUnit,
  pxFromPxU,
} from "./workspace-operations"
import { unitToPxUFixed } from "@/lib/editor/units"

describe("workspace-operations", () => {
  it("normalizeUnit falls back to cm", () => {
    expect(normalizeUnit("mm")).toBe("mm")
    expect(normalizeUnit("nope")).toBe("cm")
    expect(normalizeUnit(undefined)).toBe("cm")
  })

  it("computeLockedDimension uses ratio w/h", () => {
    expect(computeLockedDimension({ changedValue: 10, ratio: 2, changedAxis: "w" })).toBe(5)
    expect(computeLockedDimension({ changedValue: 10, ratio: 2, changedAxis: "h" })).toBe(20)
  })

  it("pxFromPxU matches DB rounding ((u+500000)/1e6)", () => {
    expect(pxFromPxU(1_000_000n)).toBe(1)
    expect(pxFromPxU(1_499_999n)).toBe(1)
    expect(pxFromPxU(1_500_000n)).toBe(2)
    expect(pxFromPxU(1_999_999n)).toBe(2)
  })

  it("computeWorkspaceSizeSave returns next row + stable signature", () => {
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "cm",
      width_value: 20,
      height_value: 30,
      width_px_u: "0",
      height_px_u: "0",
      width_px: 1,
      height_px: 1,
    }

    const r1 = computeWorkspaceSizeSave({ base, draftW: "200", draftH: "300" })
    if ("error" in r1) throw new Error("expected ok")
    const r2 = computeWorkspaceSizeSave({ base, draftW: "200", draftH: "300" })
    if ("error" in r2) throw new Error("expected ok")

    expect(r1.signature).toBe(r2.signature)
    expect(typeof r1.next.width_px_u).toBe("string")
    expect(typeof r1.next.height_px_u).toBe("string")
    expect(r1.next.width_px).toBe(200)
    expect(r1.next.height_px).toBe(300)
  })

  it("computeWorkspaceSizeSave rejects out-of-range geometry", () => {
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "px",
      width_value: 20,
      height_value: 30,
      width_px_u: "0",
      height_px_u: "0",
      width_px: 1,
      height_px: 1,
    }
    const out = computeWorkspaceSizeSave({ base, draftW: "40000", draftH: "300" })
    expect("error" in out ? out.error : "").toBe("Size out of supported range")
  })

  it("computeWorkspaceUnitChange preserves canonical geometry", () => {
    const widthPxU = unitToPxUFixed("200", "mm")
    const heightPxU = unitToPxUFixed("100", "mm")
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "mm",
      width_value: 200,
      height_value: 100,
      width_px_u: widthPxU.toString(),
      height_px_u: heightPxU.toString(),
      width_px: 567,
      height_px: 283,
    }

    const out = computeWorkspaceUnitChange({ base, nextUnit: "cm" })
    expect(out.next.unit).toBe("cm")
    expect(out.next.width_px_u).toBe(base.width_px_u)
    expect(out.next.height_px_u).toBe(base.height_px_u)
  })

  it("computeWorkspaceUnitChange derives display values from canonical px_u (no cumulative drift)", () => {
    const widthPxU = unitToPxUFixed("200", "mm")
    const heightPxU = unitToPxUFixed("100", "mm")
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "mm",
      width_value: 200,
      height_value: 100,
      width_px_u: widthPxU.toString(),
      height_px_u: heightPxU.toString(),
      width_px: 567,
      height_px: 283,
    }
    const toCm = computeWorkspaceUnitChange({ base, nextUnit: "cm" })
    const backToMm = computeWorkspaceUnitChange({ base: { ...toCm.next, unit: "cm" }, nextUnit: "mm" })
    expect(String(backToMm.next.width_value)).toBe("200")
    expect(String(backToMm.next.height_value)).toBe("100")
  })
})
