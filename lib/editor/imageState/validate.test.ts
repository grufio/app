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
      image_id: "2e306bed-0f1a-4124-a1c7-2702d85c21e7",
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
      image_id: "2e306bed-0f1a-4124-a1c7-2702d85c21e7",
      rotation_deg: 0,
    })
    expect(res).toBeNull()
  })

  it("rejects payloads below minimum size (must be >= 1px = 1_000_000µpx)", () => {
    const res = validateIncomingImageStateUpsert({
      image_id: "2e306bed-0f1a-4124-a1c7-2702d85c21e7",
      width_px_u: "999999",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(res).toBeNull()
  })

  it("accepts payloads without image_id (post-master-anchor refactor — server resolves master.id)", () => {
    const res = validateIncomingImageStateUpsert({
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(res).not.toBeNull()
    expect(res?.width_px_u).toBe("1000000")
  })

  it("ignores legacy `image_id` and `role` fields if present (deploy-window backward compat)", () => {
    const res = validateIncomingImageStateUpsert({
      image_id: "legacy-uuid",
      role: "master",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(res).not.toBeNull()
    // The validator must not surface `image_id` or `role` in the output.
    const result = res as unknown as Record<string, unknown>
    expect(result.image_id).toBeUndefined()
    expect(result.role).toBeUndefined()
  })

  it("accepts partial position payloads (x omitted preserves existing row)", () => {
    const res = validateIncomingImageStateUpsert({
      image_id: "2e306bed-0f1a-4124-a1c7-2702d85c21e7",
      // x_px_u omitted — caller wants to preserve existing axis.
      y_px_u: "5000000",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(res).not.toBeNull()
    expect(res?.x_px_u).toBeUndefined()
    expect(res?.y_px_u).toBe("5000000")
  })

  it("accepts partial position payloads (y omitted preserves existing row)", () => {
    const res = validateIncomingImageStateUpsert({
      image_id: "2e306bed-0f1a-4124-a1c7-2702d85c21e7",
      x_px_u: "5000000",
      // y_px_u omitted.
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(res).not.toBeNull()
    expect(res?.x_px_u).toBe("5000000")
    expect(res?.y_px_u).toBeUndefined()
  })

  it("rejects explicit null axes (callers must omit the key to preserve)", () => {
    const xNull = validateIncomingImageStateUpsert({
      image_id: "2e306bed-0f1a-4124-a1c7-2702d85c21e7",
      x_px_u: null,
      y_px_u: "0",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(xNull).toBeNull()

    const yNull = validateIncomingImageStateUpsert({
      image_id: "2e306bed-0f1a-4124-a1c7-2702d85c21e7",
      x_px_u: "0",
      y_px_u: null,
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(yNull).toBeNull()
  })

  it("rejects out-of-bounds axes when provided", () => {
    const res = validateIncomingImageStateUpsert({
      image_id: "2e306bed-0f1a-4124-a1c7-2702d85c21e7",
      x_px_u: "999999999999999999999",
      y_px_u: "0",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    })
    expect(res).toBeNull()
  })
})

