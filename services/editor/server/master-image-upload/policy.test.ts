import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DEFAULT_USER_MAX_UPLOAD_BYTES,
  DEFAULT_USER_UPLOAD_MAX_PIXELS,
  validateUploadInputs,
  validateUploadLimits,
} from "./policy"

function makeUpload(sizeBytes: number, mimeType = "image/png"): { sizeBytes: number; mimeType: string } {
  return { sizeBytes, mimeType }
}

describe("validateUploadInputs", () => {
  it("returns ok when all required fields are positive integers", () => {
    const result = validateUploadInputs({ widthPx: 100, heightPx: 200, dpi: 300 })
    expect(result).toEqual({ ok: true, widthPx: 100, heightPx: 200, dpi: 300 })
  })

  it("fails on missing width or height", () => {
    const r1 = validateUploadInputs({ widthPx: null, heightPx: 200, dpi: 300 })
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.stage).toBe("validation")
    const r2 = validateUploadInputs({ widthPx: 100, heightPx: 0, dpi: 300 })
    expect(r2.ok).toBe(false)
  })

  it("fails on missing dpi", () => {
    const r = validateUploadInputs({ widthPx: 100, heightPx: 200, dpi: null })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/dpi/i)
  })
})

describe("validateUploadLimits — defaults", () => {
  const original = {
    bytes: process.env.USER_MAX_UPLOAD_BYTES,
    pixels: process.env.USER_UPLOAD_MAX_PIXELS,
    mime: process.env.USER_ALLOWED_UPLOAD_MIME,
  }

  beforeEach(() => {
    delete process.env.USER_MAX_UPLOAD_BYTES
    delete process.env.USER_UPLOAD_MAX_PIXELS
    delete process.env.USER_ALLOWED_UPLOAD_MIME
  })

  afterEach(() => {
    if (original.bytes != null) process.env.USER_MAX_UPLOAD_BYTES = original.bytes
    if (original.pixels != null) process.env.USER_UPLOAD_MAX_PIXELS = original.pixels
    if (original.mime != null) process.env.USER_ALLOWED_UPLOAD_MIME = original.mime
  })

  it("passes when file size and pixels are under defaults", () => {
    const result = validateUploadLimits({ ...makeUpload(1024), widthPx: 100, heightPx: 100 })
    expect(result).toBeNull()
  })

  it("rejects with 413 when size exceeds DEFAULT_USER_MAX_UPLOAD_BYTES", () => {
    const result = validateUploadLimits({
      ...makeUpload(DEFAULT_USER_MAX_UPLOAD_BYTES + 1),
      widthPx: 100,
      heightPx: 100,
    })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.status).toBe(413)
      expect(result.stage).toBe("upload_limits")
      expect(result.reason).toMatch(/upload too large/i)
      expect(result.details?.max_bytes).toBe(DEFAULT_USER_MAX_UPLOAD_BYTES)
    }
  })

  it("rejects with 413 when pixels exceed DEFAULT_USER_UPLOAD_MAX_PIXELS", () => {
    // 100 MP cap → 12000 × 9000 = 108 MP
    const result = validateUploadLimits({ ...makeUpload(1024), widthPx: 12_000, heightPx: 9_000 })
    expect(result).not.toBeNull()
    if (result) {
      expect(result.status).toBe(413)
      expect(result.stage).toBe("upload_limits")
      expect(result.reason).toMatch(/dimensions too large/i)
      expect(result.details?.max_pixels).toBe(DEFAULT_USER_UPLOAD_MAX_PIXELS)
    }
  })
})

describe("validateUploadLimits — env overrides", () => {
  const original = process.env.USER_MAX_UPLOAD_BYTES

  afterEach(() => {
    if (original == null) delete process.env.USER_MAX_UPLOAD_BYTES
    else process.env.USER_MAX_UPLOAD_BYTES = original
  })

  it("ENV USER_MAX_UPLOAD_BYTES overrides the default downward", () => {
    process.env.USER_MAX_UPLOAD_BYTES = "2048"
    const result = validateUploadLimits({ ...makeUpload(4096), widthPx: 10, heightPx: 10 })
    expect(result?.status).toBe(413)
    expect(result?.details?.max_bytes).toBe(2048)
  })

  it("ENV USER_MAX_UPLOAD_BYTES overrides the default upward", () => {
    // Set ENV to 200 MB and try a 60 MB file (would fail under default 50 MB).
    process.env.USER_MAX_UPLOAD_BYTES = String(200 * 1024 * 1024)
    const result = validateUploadLimits({
      ...makeUpload(60 * 1024 * 1024),
      widthPx: 100,
      heightPx: 100,
    })
    expect(result).toBeNull()
  })
})
