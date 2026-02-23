import { describe, expect, it } from "vitest"

import type { WorkspaceRow } from "./workspace/types"
import { computeWorkspaceSizeSaveFromDisplay, getDisplaySizeDraft } from "./workspace-unit-controller"

describe("workspace-unit-controller", () => {
  it("renders canonical px_u as unit display drafts", () => {
    const out = getDisplaySizeDraft({
      widthPxU: 11_811_023_622n,
      heightPxU: 5_905_511_811n,
      widthPx: 1,
      heightPx: 1,
      unit: "cm",
      dpi: 150,
    })
    expect(out.widthDraft).toBe("200")
    expect(out.heightDraft).toBe("100")
  })

  it("converts display unit input back to px geometry", () => {
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "mm",
      width_value: 200,
      height_value: 100,
      output_dpi: 150,
      artboard_dpi: 150,
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
      dpi: 150,
    })
    if ("error" in out) throw new Error("expected valid conversion")
    expect(out.next.width_px).toBe(1181)
    expect(out.next.height_px).toBe(591)
  })

  it("preserves canonical value for repeated unit display conversions (A4 @300dpi)", () => {
    const base: WorkspaceRow = {
      project_id: "p",
      unit: "cm",
      width_value: 21,
      height_value: 29.7,
      output_dpi: 300,
      artboard_dpi: 300,
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
      dpi: 300,
    })
    if ("error" in saved) throw new Error("expected valid conversion")
    const mm = getDisplaySizeDraft({
      widthPxU: BigInt(saved.next.width_px_u),
      heightPxU: BigInt(saved.next.height_px_u),
      widthPx: saved.next.width_px,
      heightPx: saved.next.height_px,
      unit: "mm",
      dpi: 300,
    })
    expect(mm.widthDraft).toBe("210")
    expect(mm.heightDraft).toBe("297")
  })
})

