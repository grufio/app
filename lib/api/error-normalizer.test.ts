import { describe, expect, it } from "vitest"

import { ApiError } from "./api-error"
import {
  formatNormalizedApiError,
  formatOperationErrorForToast,
  normalizeApiError,
} from "./error-normalizer"

describe("normalizeApiError — structural ApiError extraction", () => {
  it("reads stage + error + correlationId from ApiError payload", () => {
    const err = new ApiError({
      prefix: "save",
      action: "image_state",
      status: 409,
      payload: {
        error: "Master image is locked",
        stage: "lock_conflict",
        correlationId: "abc-123-uuid",
      },
    })
    const out = normalizeApiError(err)
    expect(out.stage).toBe("lock_conflict")
    expect(out.message).toBe("Master image is locked")
    expect(out.correlationId).toBe("abc-123-uuid")
    expect(out.code).toMatch(/save\.image_state\.lock_conflict/)
  })

  it("falls back to err.message when payload.error is missing", () => {
    const err = new ApiError({
      prefix: "p",
      action: "a",
      status: 500,
      payload: { stage: "validation" },
    })
    const out = normalizeApiError(err)
    expect(out.stage).toBe("validation")
    expect(out.message).toBeTruthy()
  })

  it("reads reason field from payload when present", () => {
    const err = new ApiError({
      prefix: "p",
      action: "a",
      status: 409,
      payload: {
        error: "Image locked",
        stage: "lock_conflict",
        reason: "image_locked",
      },
    })
    const out = normalizeApiError(err)
    expect(out.reason).toBe("image_locked")
  })

  it("defaults stage to 'unknown' when payload omits it", () => {
    const err = new ApiError({
      prefix: "p",
      action: "a",
      status: 500,
      payload: { error: "oops" },
    })
    const out = normalizeApiError(err)
    expect(out.stage).toBe("unknown")
    expect(out.message).toBe("oops")
  })
})

describe("normalizeApiError — legacy regex parsing", () => {
  it("extracts stage from formatApiError-style message", () => {
    const out = normalizeApiError(
      new Error("Failed to apply filter (HTTP 409, stage=chain_invalid): chain mismatch")
    )
    expect(out.stage).toBe("chain_invalid")
    expect(out.message).not.toMatch(/HTTP/)
    expect(out.message).not.toMatch(/stage=/)
    expect(out.message).toMatch(/chain mismatch/i)
  })

  it("returns 'unknown' stage when no stage= marker is present", () => {
    const out = normalizeApiError(new Error("fetch failed"))
    expect(out.stage).toBe("unknown")
    expect(out.message).toMatch(/fetch failed/)
  })

  it("handles plain strings", () => {
    const out = normalizeApiError("plain string")
    expect(out.stage).toBe("unknown")
    expect(out.message).toBe("plain string")
  })

  it("handles null / undefined / unknown types", () => {
    expect(normalizeApiError(null)).toEqual({ stage: "unknown", message: "Unknown error" })
    expect(normalizeApiError(undefined)).toEqual({ stage: "unknown", message: "Unknown error" })
    expect(normalizeApiError(42)).toEqual({ stage: "unknown", message: "Unknown error" })
  })

  it("passes through an already-OperationError input unchanged", () => {
    const input = { stage: "lock_conflict", message: "Locked", correlationId: "xyz" } as const
    const out = normalizeApiError(input)
    expect(out).toBe(input)
  })
})

describe("formatOperationErrorForToast", () => {
  it("maps chain_invalid to friendly toast copy", () => {
    const t = formatOperationErrorForToast({ stage: "chain_invalid", message: "x" })
    expect(t.title).toBe("Filter chain is out of sync")
    expect(t.detail).toMatch(/Close this dialog/i)
    expect(t.retriable).toBe(true)
  })

  it("maps lock_conflict", () => {
    const t = formatOperationErrorForToast({ stage: "lock_conflict", message: "x" })
    expect(t.title).toBe("Image is locked")
    expect(t.retriable).toBe(false)
  })

  it("maps service_unavailable as retriable", () => {
    const t = formatOperationErrorForToast({ stage: "service_unavailable", message: "x" })
    expect(t.title).toBe("Filter service is temporarily unavailable")
    expect(t.retriable).toBe(true)
  })

  it("maps upload_limits", () => {
    const t = formatOperationErrorForToast({ stage: "upload_limits", message: "x" })
    expect(t.title).toBe("Upload exceeds the limit")
  })

  it("falls back to raw message for unknown stages", () => {
    const t = formatOperationErrorForToast({ stage: "mystery_stage", message: "something broke" })
    expect(t.title).toBe("something broke")
    expect(t.detail).toBeUndefined()
    expect(t.retriable).toBe(false)
  })

  it("returns 'Unknown error' title when message is empty", () => {
    const t = formatOperationErrorForToast({ stage: "x", message: "" })
    expect(t.title).toBe("Unknown error")
  })
})

describe("formatNormalizedApiError", () => {
  it("joins title + detail with em-dash when both exist", () => {
    const msg = formatNormalizedApiError(
      new Error("Something (HTTP 409, stage=chain_invalid): bad")
    )
    expect(msg).toBe(
      "Filter chain is out of sync — Close this dialog and re-open the project to refresh the editor state."
    )
  })

  it("returns title only when no detail", () => {
    const msg = formatNormalizedApiError(new Error("Failed (HTTP 400): nope"))
    expect(msg).not.toContain("—")
    expect(msg).toMatch(/nope/i)
  })
})
