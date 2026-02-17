/**
 * Unit tests for editor artboard display helpers.
 */
import { describe, expect, it } from "vitest"

import { unitToPxU } from "@/lib/editor/units"
import { computeArtboardSizeDisplay } from "./artboard-display"

describe("services/editor/artboard-display", () => {
  it("formats canonical µpx into display strings", () => {
    const dpi = 300
    const widthPxU = unitToPxU("100", "mm", dpi)
    const heightPxU = unitToPxU("50", "mm", dpi)
    const out = computeArtboardSizeDisplay({ widthPxU, heightPxU, unit: "mm", dpi })
    expect(out).toEqual({ width: "100", height: "50" })
  })
})

