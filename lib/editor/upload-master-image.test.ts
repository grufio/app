import { beforeEach, describe, expect, it, vi } from "vitest"

import { PROJECT_IMAGES_BUCKET } from "@/lib/storage/buckets"
import { uploadMasterImageClient } from "./upload-master-image"

/** Minimal browser-Supabase stub exposing `storage.from().upload`. */
function makeSupabaseStub(uploadResult: { error: unknown }) {
  const uploadSpy = vi.fn(async (_path: string, _file: File, _opts?: unknown) => uploadResult)
  const fromSpy = vi.fn((_bucket: string) => ({ upload: uploadSpy }))
  return {
    client: { storage: { from: fromSpy } } as never,
    uploadSpy,
    fromSpy,
  }
}

describe("upload-master-image", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("uploads the file directly to Storage, then finalizes with JSON {imageId, fileName, format}", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" })
    const { client, uploadSpy, fromSpy } = makeSupabaseStub({ error: null })

    let finalizeUrl = ""
    let finalizeBody: Record<string, unknown> | null = null
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      finalizeUrl = String(input)
      finalizeBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ ok: true, master: null }), { status: 200 })
    }) as unknown as typeof fetch

    const out = await uploadMasterImageClient({ projectId: "p1", file, fetchImpl, supabaseClient: client })
    expect(out).toEqual({ ok: true, master: null })

    // Step 1: direct storage upload to projects/p1/images/{uuid} in the right bucket.
    expect(fromSpy).toHaveBeenCalledWith(PROJECT_IMAGES_BUCKET)
    const uploadPath = uploadSpy.mock.calls[0]![0] as string
    expect(uploadPath).toMatch(/^projects\/p1\/images\/[0-9a-fA-F-]{36}$/)
    expect(uploadSpy.mock.calls[0]![1]).toBe(file)

    // Step 2: finalize JSON references the same imageId + cheap metadata.
    expect(finalizeUrl).toContain("/api/projects/p1/images/master/finalize")
    expect(finalizeBody!.imageId).toBe(uploadPath.split("/").pop())
    expect(finalizeBody!.fileName).toBe("test.png")
    expect(finalizeBody!.format).toBeTruthy()
    // Dimensions + DPI are derived server-side — never sent by the client.
    expect(finalizeBody!.width_px).toBeUndefined()
  })

  it("surfaces a direct-storage upload error without calling finalize", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" })
    const { client } = makeSupabaseStub({ error: { message: "exceeded the maximum allowed size" } })
    const fetchImpl = vi.fn() as unknown as typeof fetch

    const out = await uploadMasterImageClient({ projectId: "p1", file, fetchImpl, supabaseClient: client })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain("Upload failed (storage)")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("normalizes a finalize API error payload into a stable message", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" })
    const { client } = makeSupabaseStub({ error: null })
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Forbidden", stage: "rls_denied" }), { status: 403 })
    }) as unknown as typeof fetch

    const out = await uploadMasterImageClient({ projectId: "p1", file, fetchImpl, supabaseClient: client })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.error).toContain("Upload failed (HTTP 403)")
      expect(out.error).toContain("(rls_denied)")
      expect(out.error).toContain("Forbidden")
    }
  })
})
