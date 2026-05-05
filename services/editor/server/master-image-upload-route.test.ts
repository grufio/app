import { describe, expect, it, vi } from "vitest"

const VALID_UUID = "c104be01-d7b0-4af4-a446-8326cd47a282"
const { uploadMasterImageMock, makeSupabaseMock } = vi.hoisted(() => ({
  uploadMasterImageMock: vi.fn(),
  makeSupabaseMock: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (table === "projects") return { data: { id: VALID_UUID }, error: null }
            return { data: null, error: { message: "unexpected table" } }
          },
        }),
      }),
    }),
  }),
}))

describe("master upload route delegation", () => {
  it("returns success payload from upload service", async () => {
    vi.resetModules()
    uploadMasterImageMock.mockReset()
    uploadMasterImageMock.mockResolvedValueOnce({
      ok: true as const,
      id: "img-1",
      storagePath: "projects/p1/images/img-1",
    })

    vi.mock("@/services/editor/server/master-image-upload", () => ({
      uploadMasterImage: uploadMasterImageMock,
    }))

    vi.mock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeSupabaseMock(),
    }))

    const mod = await import("@/app/api/projects/[projectId]/images/master/upload/route")
    const form = new FormData()
    form.set("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }))
    form.set("width_px", "100")
    form.set("height_px", "100")
    form.set("dpi", "300")
    form.set("bit_depth", "8")
    form.set("format", "png")
    const res = await mod.POST(new Request("http://test.local", { method: "POST", body: form }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      id: "img-1",
      storage_path: "projects/p1/images/img-1",
    })
  })

  it("delegates parsed request to upload service and maps failure response", async () => {
    vi.resetModules()
    uploadMasterImageMock.mockReset()
    uploadMasterImageMock.mockResolvedValue({
      ok: false as const,
      status: 415,
      stage: "upload_limits" as const,
      reason: "Unsupported file type",
    })

    vi.mock("@/services/editor/server/master-image-upload", () => ({
      uploadMasterImage: uploadMasterImageMock,
    }))

    vi.mock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeSupabaseMock(),
    }))

    const mod = await import("@/app/api/projects/[projectId]/images/master/upload/route")
    const form = new FormData()
    form.set("file", new File([new Uint8Array([1, 2, 3])], "x.bin", { type: "application/octet-stream" }))
    form.set("width_px", "100")
    form.set("height_px", "100")
    form.set("format", "unknown")
    const res = await mod.POST(new Request("http://test.local", { method: "POST", body: form }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })

    expect(uploadMasterImageMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(415)
    const body = await res.json()
    expect(body.stage).toBe("upload_limits")
  })

  it("forwards dpi and bit_depth when provided", async () => {
    vi.resetModules()
    uploadMasterImageMock.mockReset()
    uploadMasterImageMock.mockResolvedValueOnce({
      ok: false as const,
      status: 400,
      stage: "validation" as const,
      reason: "Missing/invalid width_px/height_px",
    })

    vi.mock("@/services/editor/server/master-image-upload", () => ({
      uploadMasterImage: uploadMasterImageMock,
    }))

    vi.mock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeSupabaseMock(),
    }))

    const mod = await import("@/app/api/projects/[projectId]/images/master/upload/route")
    const form = new FormData()
    form.set("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }))
    form.set("width_px", "100")
    form.set("height_px", "100")
    form.set("dpi", "300")
    form.set("bit_depth", "16")
    form.set("format", "png")
    await mod.POST(new Request("http://test.local", { method: "POST", body: form }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })

    expect(uploadMasterImageMock).toHaveBeenCalledTimes(1)
    expect(uploadMasterImageMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        dpi: 300,
        bitDepth: 16,
      })
    )
  })

  it("maps service details into error payload", async () => {
    vi.resetModules()
    uploadMasterImageMock.mockReset()
    uploadMasterImageMock.mockResolvedValueOnce({
      ok: false as const,
      status: 413,
      stage: "upload_limits" as const,
      reason: "Upload too large",
      details: { max_bytes: 10, got_bytes: 20 },
    })

    vi.mock("@/services/editor/server/master-image-upload", () => ({
      uploadMasterImage: uploadMasterImageMock,
    }))

    vi.mock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeSupabaseMock(),
    }))

    const mod = await import("@/app/api/projects/[projectId]/images/master/upload/route")
    const form = new FormData()
    form.set("file", new File([new Uint8Array([1, 2, 3])], "x.bin", { type: "application/octet-stream" }))
    form.set("width_px", "100")
    form.set("height_px", "100")
    form.set("format", "unknown")
    const res = await mod.POST(new Request("http://test.local", { method: "POST", body: form }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })

    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.stage).toBe("upload_limits")
    expect(body.max_bytes).toBe(10)
    expect(body.got_bytes).toBe(20)
  })

  it("propagates transform_sync failures from service", async () => {
    vi.resetModules()
    uploadMasterImageMock.mockReset()
    uploadMasterImageMock.mockResolvedValueOnce({
      ok: false as const,
      status: 500,
      stage: "transform_sync" as const,
      reason: "Source image transform is missing",
    })

    vi.mock("@/services/editor/server/master-image-upload", () => ({
      uploadMasterImage: uploadMasterImageMock,
    }))

    vi.mock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeSupabaseMock(),
    }))

    const mod = await import("@/app/api/projects/[projectId]/images/master/upload/route")
    const form = new FormData()
    form.set("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }))
    form.set("width_px", "100")
    form.set("height_px", "100")
    form.set("dpi", "300")
    form.set("bit_depth", "8")
    form.set("format", "png")
    const res = await mod.POST(new Request("http://test.local", { method: "POST", body: form }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.stage).toBe("transform_sync")
    expect(body.error).toBe("Source image transform is missing")
  })

  it("delegates without workspace dpi", async () => {
    vi.resetModules()
    uploadMasterImageMock.mockReset()
    uploadMasterImageMock.mockResolvedValueOnce({
      ok: false as const,
      status: 400,
      stage: "validation" as const,
      reason: "Missing/invalid width_px/height_px",
    })

    vi.mock("@/services/editor/server/master-image-upload", () => ({
      uploadMasterImage: uploadMasterImageMock,
    }))

    vi.mock("@/lib/supabase/server", () => ({
      createSupabaseServerClient: async () => makeSupabaseMock(),
    }))

    const mod = await import("@/app/api/projects/[projectId]/images/master/upload/route")
    const form = new FormData()
    form.set("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }))
    form.set("width_px", "100")
    form.set("height_px", "100")
    form.set("format", "png")
    await mod.POST(new Request("http://test.local", { method: "POST", body: form }), {
      params: Promise.resolve({ projectId: VALID_UUID }),
    })
    expect(uploadMasterImageMock).toHaveBeenCalledTimes(1)
    expect(uploadMasterImageMock.mock.calls[0]?.[0]).toMatchObject({ dpi: null, bitDepth: null })
  })

  it("keeps single upload write route by removing master POST export", async () => {
    vi.resetModules()
    const mod = await import("@/app/api/projects/[projectId]/images/master/route")
    expect("POST" in mod).toBe(false)
  })
})
