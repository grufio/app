import { describe, expect, it } from "vitest"

import { formatNormalizedApiError, normalizeApiError } from "./error-normalizer"

describe("normalizeApiError", () => {
  it("maps chain_invalid stage to friendly copy", () => {
    const out = normalizeApiError(
      new Error("Failed to apply filter (HTTP 409, stage=chain_invalid): chain mismatch")
    )
    expect(out.title).toBe("Filter chain is out of sync")
    expect(out.detail).toMatch(/Close this dialog/i)
    expect(out.stage).toBe("chain_invalid")
    expect(out.retriable).toBe(true)
  })

  it("maps lock_conflict stage", () => {
    const out = normalizeApiError(
      new Error("Failed to apply filter (HTTP 409, stage=lock_conflict): Source image is locked")
    )
    expect(out.title).toBe("Image is locked")
    expect(out.stage).toBe("lock_conflict")
    expect(out.retriable).toBe(false)
  })

  it("maps service_unavailable stage to retriable filter-service copy", () => {
    const out = normalizeApiError(
      new Error("Failed to apply filter (HTTP 503, stage=service_unavailable): Filter service is temporarily unavailable. Please try again.")
    )
    expect(out.title).toBe("Filter service is temporarily unavailable")
    expect(out.stage).toBe("service_unavailable")
    expect(out.retriable).toBe(true)
  })

  it("maps upload_limits stage", () => {
    const out = normalizeApiError(
      new Error("Upload too large (HTTP 413, stage=upload_limits): Image dimensions too large")
    )
    expect(out.title).toBe("Upload exceeds the limit")
    expect(out.stage).toBe("upload_limits")
  })

  it("strips the (HTTP X, stage=Y) suffix when stage is unknown", () => {
    const out = normalizeApiError(
      new Error("Failed to crop image (HTTP 400, stage=mystery_stage): something broke")
    )
    expect(out.title).not.toMatch(/HTTP/)
    expect(out.title).not.toMatch(/stage=/)
    expect(out.title).toMatch(/Failed to crop image/i)
    expect(out.title).toMatch(/something broke/i)
    expect(out.stage).toBe("mystery_stage")
  })

  it("treats 5xx as retriable, 4xx as non-retriable when no stage match", () => {
    const r5 = normalizeApiError(new Error("Failed (HTTP 502): bad gateway"))
    expect(r5.retriable).toBe(true)
    const r4 = normalizeApiError(new Error("Failed (HTTP 404): not found"))
    expect(r4.retriable).toBe(false)
  })

  it("treats network-style errors (no HTTP marker) as retriable", () => {
    const out = normalizeApiError(new Error("fetch failed"))
    expect(out.retriable).toBe(true)
  })

  it("handles non-Error inputs", () => {
    expect(normalizeApiError("plain string").title).toBe("plain string")
    expect(normalizeApiError(null).title).toBe("Unknown error")
    expect(normalizeApiError(undefined).title).toBe("Unknown error")
  })
})

describe("formatNormalizedApiError", () => {
  it("joins title + detail with em-dash when both exist", () => {
    const msg = formatNormalizedApiError(
      new Error("Something (HTTP 409, stage=chain_invalid): bad")
    )
    expect(msg).toBe("Filter chain is out of sync — Close this dialog and re-open the project to refresh the editor state.")
  })

  it("returns title only when no detail", () => {
    const msg = formatNormalizedApiError(new Error("Failed (HTTP 400): nope"))
    expect(msg).not.toContain("—")
    expect(msg).toMatch(/nope/i)
  })
})
