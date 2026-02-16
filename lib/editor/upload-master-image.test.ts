import { beforeEach, describe, expect, it, vi } from "vitest"

import { extractImagePpiFromBytes, uploadMasterImage } from "./upload-master-image"

vi.mock("@/lib/images/dimensions", () => ({
  getImageDimensions: async () => ({ width: 640, height: 480 }),
}))

function makePngWithPhysPpi(ppi: number): Uint8Array {
  const xPpm = Math.round(ppi / 0.0254)
  const yPpm = xPpm
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    // IHDR chunk (len=13)
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, // width
    0x00, 0x00, 0x00, 0x01, // height
    0x08, 0x02, 0x00, 0x00, 0x00, // bit depth/color/interlace
    0x00, 0x00, 0x00, 0x00, // crc (ignored)
    // pHYs chunk (len=9)
    0x00, 0x00, 0x00, 0x09, 0x70, 0x48, 0x59, 0x73,
    (xPpm >>> 24) & 0xff, (xPpm >>> 16) & 0xff, (xPpm >>> 8) & 0xff, xPpm & 0xff,
    (yPpm >>> 24) & 0xff, (yPpm >>> 16) & 0xff, (yPpm >>> 8) & 0xff, yPpm & 0xff,
    0x01, // meters
    0x00, 0x00, 0x00, 0x00, // crc (ignored)
    // IEND chunk
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
    0x00, 0x00, 0x00, 0x00,
  ])
}

describe("upload-master-image", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("extracts PNG pHYs PPI as a positive integer", () => {
    const bytes = makePngWithPhysPpi(300)
    const dpi = extractImagePpiFromBytes(bytes.buffer, "image/png")
    expect(dpi).toBe(300)
  })

  it("returns null for unsupported mime", () => {
    const dpi = extractImagePpiFromBytes(new Uint8Array([1, 2, 3]).buffer, "image/webp")
    expect(dpi).toBeNull()
  })

  it("submits form-data and includes dpi when extracted", async () => {
    const bytes = makePngWithPhysPpi(300)
    const file = new File([bytes], "test.png", { type: "image/png" })
    let capturedBody: FormData | null = null

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as FormData
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch

    const out = await uploadMasterImage({ projectId: "p1", file, fetchImpl })
    expect(out).toEqual({ ok: true })
    expect(capturedBody?.get("width_px")).toBe("640")
    expect(capturedBody?.get("height_px")).toBe("480")
    expect(capturedBody?.get("dpi")).toBe("300")
  })

  it("normalizes API error payload into a stable message", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" })
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Forbidden", stage: "rls_denied" }), { status: 403 })
    }) as unknown as typeof fetch

    const out = await uploadMasterImage({ projectId: "p1", file, fetchImpl })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toContain("Upload failed (HTTP 403)")
      expect(out.error).toContain("(rls_denied)")
      expect(out.error).toContain("Forbidden")
    }
  })
})
