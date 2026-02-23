/**
 * Unit tests for editor artboard display helpers.
 */
import { describe, expect, it } from "vitest"

import { unitToPxUFixed } from "@/lib/editor/units"
import { computeArtboardSizeDisplay } from "./artboard-display"

describe("services/editor/artboard-display", () => {
  it("formats canonical µpx into display strings", () => {
    const widthPxU = unitToPxUFixed("100", "mm")
    const heightPxU = unitToPxUFixed("50", "mm")
    const out = computeArtboardSizeDisplay({ widthPxU, heightPxU, unit: "mm" })
    expect(out).toEqual({ width: "100", height: "50" })
  })
})

