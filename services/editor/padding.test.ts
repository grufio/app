import { describe, expect, it } from "vitest"

import type { WorkspaceRow } from "@/lib/editor/project-workspace"
import { clampPaddingPxU, normalizeWorkspacePadding } from "./padding"

describe("clampPaddingPxU", () => {
  it("passes a valid µpx value through", () => {
    expect(clampPaddingPxU("5000000")).toBe("5000000")
  })

  it("defaults empty / missing / non-numeric to '0'", () => {
    expect(clampPaddingPxU("")).toBe("0")
    expect(clampPaddingPxU(undefined)).toBe("0")
    expect(clampPaddingPxU(null)).toBe("0")
    expect(clampPaddingPxU("abc")).toBe("0")
  })

  it("clamps negatives to '0'", () => {
    expect(clampPaddingPxU("-100")).toBe("0")
  })

  it("clamps values above MAX_PX_U to the maximum", () => {
    expect(clampPaddingPxU("99999999999999")).toBe("32768000000")
  })
})

describe("normalizeWorkspacePadding", () => {
  it("returns zeros for a null row", () => {
    expect(normalizeWorkspacePadding(null)).toEqual({
      topPxU: "0",
      bottomPxU: "0",
      leftPxU: "0",
      rightPxU: "0",
    })
  })

  it("reads and clamps each side", () => {
    const row = {
      padding_top_px_u: "1000000",
      padding_bottom_px_u: "-5",
      padding_left_px_u: "2000000",
      padding_right_px_u: undefined,
    } as unknown as WorkspaceRow
    expect(normalizeWorkspacePadding(row)).toEqual({
      topPxU: "1000000",
      bottomPxU: "0",
      leftPxU: "2000000",
      rightPxU: "0",
    })
  })
})
