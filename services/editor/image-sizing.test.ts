/**
 * Unit tests for editor image sizing helpers.
 */
import { describe, expect, it } from "vitest"

import type { Unit } from "@/lib/editor/units"
import { unitToPxU } from "@/lib/editor/units"
import {
  computeLockedAspectOtherDimensionFromHeightInput,
  computeLockedAspectOtherDimensionFromWidthInput,
  parseAndClampImageSize,
} from "./image-sizing"

describe("services/editor/image-sizing", () => {
  it("parseAndClampImageSize converts both inputs to µpx", () => {
    const unit: Unit = "mm"
    const dpi = 300
    const out = parseAndClampImageSize({ draftW: "100", draftH: "50", unit, dpi })
    expect(out?.wPxU).toBe(unitToPxU("100", unit, dpi))
    expect(out?.hPxU).toBe(unitToPxU("50", unit, dpi))
  })

  it("locked aspect: width input derives height by ratio", () => {
    const unit: Unit = "mm"
    const dpi = 300
    const ratio = { wPxU: unitToPxU("200", unit, dpi), hPxU: unitToPxU("100", unit, dpi) } // 2:1

    const out = computeLockedAspectOtherDimensionFromWidthInput({ nextWidthInput: "50", unit, dpi, ratio })
    expect(out).not.toBeNull()
    expect(out!.nextHeightPxU).toBe(unitToPxU("25", unit, dpi))
  })

  it("locked aspect: height input derives width by ratio", () => {
    const unit: Unit = "mm"
    const dpi = 300
    const ratio = { wPxU: unitToPxU("200", unit, dpi), hPxU: unitToPxU("100", unit, dpi) } // 2:1

    const out = computeLockedAspectOtherDimensionFromHeightInput({ nextHeightInput: "10", unit, dpi, ratio })
    expect(out).not.toBeNull()
    expect(out!.nextWidthPxU).toBe(unitToPxU("20", unit, dpi))
  })
})

