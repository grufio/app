/**
 * Unit tests for image sizing operations (pure commit logic used by ImagePanel).
 */
import { describe, expect, it } from "vitest"

import type { Unit } from "@/lib/editor/units"
import { unitToPxUFixed } from "@/lib/editor/units"
import { computeImageSizeCommit, computeLockedAspectRatioFromCurrentSize } from "./image-sizing-operations"

describe("computeLockedAspectRatioFromCurrentSize", () => {
  it("returns null when either dimension is missing", () => {
    expect(computeLockedAspectRatioFromCurrentSize({})).toBeNull()
    expect(computeLockedAspectRatioFromCurrentSize({ widthPxU: 1000n })).toBeNull()
    expect(computeLockedAspectRatioFromCurrentSize({ heightPxU: 1000n })).toBeNull()
  })

  it("returns null when either dimension is zero or negative", () => {
    expect(computeLockedAspectRatioFromCurrentSize({ widthPxU: 0n, heightPxU: 1000n })).toBeNull()
    expect(computeLockedAspectRatioFromCurrentSize({ widthPxU: 1000n, heightPxU: 0n })).toBeNull()
  })

  it("returns the ratio for valid positive dimensions", () => {
    const w = 2_000_000n
    const h = 1_000_000n
    const ratio = computeLockedAspectRatioFromCurrentSize({ widthPxU: w, heightPxU: h })
    expect(ratio).toEqual({ w, h })
  })
})

describe("computeImageSizeCommit", () => {
  const unit: Unit = "mm"

  it("returns null when not ready", () => {
    expect(computeImageSizeCommit({ ready: false, draftW: "100", draftH: "50", unit })).toBeNull()
  })

  it("returns null for empty input", () => {
    expect(computeImageSizeCommit({ ready: true, draftW: "", draftH: "50", unit })).toBeNull()
    expect(computeImageSizeCommit({ ready: true, draftW: "100", draftH: "", unit })).toBeNull()
  })

  it("converts valid draft strings to µpx", () => {
    const out = computeImageSizeCommit({ ready: true, draftW: "100", draftH: "50", unit })
    expect(out?.wPxU).toBe(unitToPxUFixed("100", unit))
    expect(out?.hPxU).toBe(unitToPxUFixed("50", unit))
  })

  it("returns null for non-numeric input", () => {
    expect(computeImageSizeCommit({ ready: true, draftW: "abc", draftH: "50", unit })).toBeNull()
  })
})
