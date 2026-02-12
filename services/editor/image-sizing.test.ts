/**
 * Unit tests for editor image sizing helpers.
 */
import { describe, expect, it } from "vitest"

import type { Unit } from "@/lib/editor/units"
import { divRoundHalfUp, unitToPxUFixed } from "@/lib/editor/units"
import {
  computeLockedAspectOtherDimensionFromHeightInput,
  computeLockedAspectOtherDimensionFromWidthInput,
  parseAndClampImageSize,
} from "./image-sizing"

describe("services/editor/image-sizing", () => {
  it("parseAndClampImageSize converts both inputs to µpx", () => {
    const unit: Unit = "mm"
    const out = parseAndClampImageSize({ draftW: "100", draftH: "50", unit })
    expect(out?.wPxU).toBe(unitToPxUFixed("100", unit))
    expect(out?.hPxU).toBe(unitToPxUFixed("50", unit))
  })

  it("locked aspect: width input derives height by ratio", () => {
    const unit: Unit = "mm"
    const ratio = { wPxU: unitToPxUFixed("200", unit), hPxU: unitToPxUFixed("100", unit) } // 2:1

    const out = computeLockedAspectOtherDimensionFromWidthInput({ nextWidthInput: "50", unit, ratio })
    expect(out).not.toBeNull()
    expect(out!.nextHeightPxU).toBe(unitToPxUFixed("25", unit))
  })

  it("locked aspect: height input derives width by ratio", () => {
    const unit: Unit = "mm"
    const ratio = { wPxU: unitToPxUFixed("200", unit), hPxU: unitToPxUFixed("100", unit) } // 2:1

    const out = computeLockedAspectOtherDimensionFromHeightInput({ nextHeightInput: "10", unit, ratio })
    expect(out).not.toBeNull()
    const expected = divRoundHalfUp(unitToPxUFixed("10", unit) * ratio.wPxU, ratio.hPxU)
    expect(out!.nextWidthPxU).toBe(expected)
  })
})

