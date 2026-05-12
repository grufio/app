/**
 * Unit tests for `use-image-state` internals.
 *
 * Focus:
 * - Pending-slot semantics must not drop newer values during a flush.
 */
import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/api/api-error"
import { createPendingSlot, mapImageStateApiErrorToMessage } from "./use-image-state"

describe("createPendingSlot", () => {
  it("does not clear a newer pending value when clearing an older seq", () => {
    const slot = createPendingSlot<number>()
    const seq1 = slot.set(1)
    const snap1 = slot.snapshot()
    expect(snap1?.seq).toBe(seq1)
    expect(snap1?.value).toBe(1)

    const seq2 = slot.set(2)
    const snap2 = slot.snapshot()
    expect(snap2?.seq).toBe(seq2)
    expect(snap2?.value).toBe(2)

    // Attempting to clear the old seq must not clear the newer value.
    expect(slot.clearIfSeq(seq1)).toBe(false)
    expect(slot.snapshot()?.value).toBe(2)

    // Clearing the latest seq should clear.
    expect(slot.clearIfSeq(seq2)).toBe(true)
    expect(slot.snapshot()).toBe(null)
  })
})

describe("mapImageStateApiErrorToMessage", () => {
  it("maps lock_conflict on save to a clear message", () => {
    const locked = new ApiError({
      prefix: "image_state",
      action: "save",
      status: 409,
      payload: { stage: "lock_conflict" },
    })
    expect(mapImageStateApiErrorToMessage(locked, "save")).toBe("Active image is locked.")
  })

  it("maps schema_missing on load to a clear message", () => {
    const schemaMissing = new ApiError({
      prefix: "image_state",
      action: "load",
      status: 400,
      payload: { stage: "schema_missing" },
    })
    expect(mapImageStateApiErrorToMessage(schemaMissing, "load")).toBe("Unsupported image state schema.")
  })

  it("falls back to payload error when available", () => {
    const err = new ApiError({
      prefix: "image_state",
      action: "load",
      status: 400,
      payload: { stage: "whatever", error: "custom failure" },
    })
    expect(mapImageStateApiErrorToMessage(err, "load")).toBe("custom failure")
  })

  it("falls back to a generic message when no payload error", () => {
    const err = new ApiError({
      prefix: "image_state",
      action: "save",
      status: 500,
      payload: { stage: "unknown" },
    })
    expect(mapImageStateApiErrorToMessage(err, "save")).toBe("Failed to save image state.")
  })
})

