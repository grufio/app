import { beforeEach, describe, expect, it, vi } from "vitest"

import { uploadMasterImageClient } from "./upload-master-image"

vi.mock("@/lib/images/dimensions", () => ({
  getImageDimensions: async () => ({ width: 640, height: 480 }),
}))

describe("upload-master-image", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("submits form-data without client dpi", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" })
    let capturedBody: FormData | null = null

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as FormData
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as unknown as typeof fetch

    const out = await uploadMasterImageClient({ projectId: "p1", file, fetchImpl })
    expect(out).toEqual({ ok: true })
    expect(capturedBody?.get("width_px")).toBe("640")
    expect(capturedBody?.get("height_px")).toBe("480")
    expect(capturedBody?.get("dpi")).toBeNull()
  })

  it("normalizes API error payload into a stable message", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" })
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Forbidden", stage: "rls_denied" }), { status: 403 })
    }) as unknown as typeof fetch

    const out = await uploadMasterImageClient({ projectId: "p1", file, fetchImpl })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toContain("Upload failed (HTTP 403)")
      expect(out.error).toContain("(rls_denied)")
      expect(out.error).toContain("Forbidden")
    }
  })
})
