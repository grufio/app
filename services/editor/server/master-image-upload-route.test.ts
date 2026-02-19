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
    expect(uploadMasterImageMock.mock.calls[0]?.[0]).not.toHaveProperty("dpi")
  })

  it("keeps single upload write route by removing master POST export", async () => {
    vi.resetModules()
    const mod = await import("@/app/api/projects/[projectId]/images/master/route")
    expect("POST" in mod).toBe(false)
  })
})
