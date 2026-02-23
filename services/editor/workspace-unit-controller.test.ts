import { describe, expect, it } from "vitest"

import type { WorkspaceRow } from "./workspace/types"
import { computeWorkspaceSizeSaveFromDisplay, getDisplaySizeDraft } from "./workspace-unit-controller"
import { clampPx, pxUToPxNumber, unitToPxUFixed } from "@/lib/editor/units"

describe("workspace-unit-controller", () => {
  it("renders canonical px_u as unit display drafts", () => {
    const widthPxU = unitToPxUFixed("200", "mm")
    const heightPxU = unitToPxUFixed("100", "mm")
    const out = getDisplaySizeDraft({
      widthPxU,
      heightPxU,
      widthPx: 1,
      heightPx: 1,
      unit: "cm",
    })
    expect(out.widthDraft).toBe("20")
    expect(out.heightDraft).toBe("10")
  })

  it("converts display unit input back to px geometry", () => {
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "mm",
      width_value: 200,
      height_value: 100,
      output_dpi: 150,
      width_px_u: "0",
      height_px_u: "0",
      width_px: 1,
      height_px: 1,
      raster_effects_preset: "medium",
    }
    const out = computeWorkspaceSizeSaveFromDisplay({
      base,
      draftW: "20",
      draftH: "10",
      unit: "cm",
    })
    if ("error" in out) throw new Error("expected valid conversion")
    expect(out.next.width_px).toBe(clampPx(pxUToPxNumber(unitToPxUFixed("20", "cm"))))
    expect(out.next.height_px).toBe(clampPx(pxUToPxNumber(unitToPxUFixed("10", "cm"))))
  })

  it("preserves canonical value for repeated unit display conversions (A4 @300dpi)", () => {
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "cm",
      width_value: 21,
      height_value: 29.7,
      output_dpi: 300,
      width_px_u: "0",
      height_px_u: "0",
      width_px: 1,
      height_px: 1,
      raster_effects_preset: "high",
    }
    const saved = computeWorkspaceSizeSaveFromDisplay({
      base,
      draftW: "21",
      draftH: "29.7",
      unit: "cm",
    })
    if ("error" in saved) throw new Error("expected valid conversion")
    const mm = getDisplaySizeDraft({
      widthPxU: BigInt(saved.next.width_px_u),
      heightPxU: BigInt(saved.next.height_px_u),
      widthPx: saved.next.width_px,
      heightPx: saved.next.height_px,
      unit: "mm",
    })
    expect(mm.widthDraft).toBe("210")
    expect(mm.heightDraft).toBe("297")
  })

  it("rejects out-of-range converted display values", () => {
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "px",
      width_value: 1,
      height_value: 1,
      output_dpi: 150,
      width_px_u: "1000000",
      height_px_u: "1000000",
      width_px: 1,
      height_px: 1,
      raster_effects_preset: "medium",
    }
    const out = computeWorkspaceSizeSaveFromDisplay({
      base,
      draftW: "999999",
      draftH: "1",
      unit: "px",
    })
    expect("error" in out ? out.error : "").toBe("Size out of supported range")
  })
})

