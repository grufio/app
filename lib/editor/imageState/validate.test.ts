/**
 * Unit tests for image-state validation.
 *
 * Focus:
 * - µpx (bigint-as-string) bounds and required fields must be enforced deterministically.
 */
import { describe, expect, it } from "vitest"

import { validateIncomingImageStateUpsert } from "./validate"

describe("validateIncomingImageStateUpsert", () => {
  it("accepts a valid µpx payload", () => {
    const res = validateIncomingImageStateUpsert({
      role: "master",
      x_px_u: "0",
      y_px_u: "0",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(res).not.toBeNull()
    expect(res?.width_px_u).toBe("1000000")
    expect(res?.height_px_u).toBe("1000000")
    expect(res?.rotation_deg).toBe(0)
  })

  it("rejects payloads missing required size fields", () => {
    const res = validateIncomingImageStateUpsert({
      role: "master",
      rotation_deg: 0,
    })
    expect(res).toBeNull()
  })

  it("rejects payloads below minimum size (must be >= 1px = 1_000_000µpx)", () => {
    const res = validateIncomingImageStateUpsert({
      role: "master",
      width_px_u: "999999",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(res).toBeNull()
  })
})

