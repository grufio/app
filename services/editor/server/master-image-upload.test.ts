import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { uploadMasterImage } from "./master-image-upload"

const uploadSpy = vi.fn()
const activateSpy = vi.fn()

vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: () => ({
    storage: {
      from: () => ({
        upload: uploadSpy,
      }),
    },
  }),
}))

vi.mock("@/lib/supabase/project-images", () => ({
  activateMasterWithState: (...args: unknown[]) => activateSpy(...args),
}))

type InsertPayload = Record<string, unknown>

function makeSupabase(insertResult: { error: { message: string; code?: string } | null }, capture: { insert?: InsertPayload }) {
  return {
    from: () => ({
      insert: async (payload: InsertPayload) => {
        capture.insert = payload
        return insertResult
      },
    }),
  } as unknown as SupabaseClient
}

describe("master-image-upload service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.USER_MAX_UPLOAD_BYTES
    delete process.env.USER_ALLOWED_UPLOAD_MIME
    delete process.env.USER_UPLOAD_MAX_PIXELS
  })

  it("rejects invalid dimensions with validation stage", async () => {
    const supabase = makeSupabase({ error: null }, {})
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" })
    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 0,
      heightPx: 10,
      format: "png",
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("validation")
      expect(out.status).toBe(400)
    }
  })

  it("applies upload limits from env", async () => {
    process.env.USER_MAX_UPLOAD_BYTES = "1"
    const supabase = makeSupabase({ error: null }, {})
    const file = new File([new Uint8Array([1, 2])], "x.png", { type: "image/png" })

    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 10,
      heightPx: 10,
      format: "png",
      dpi: 300,
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("upload_limits")
      expect(out.status).toBe(413)
    }
  })

  it("rejects missing dpi with validation stage", async () => {
    const supabase = makeSupabase({ error: null }, {})
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" })
    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 10,
      heightPx: 10,
      format: "png",
      dpi: null,
    })

    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("validation")
      expect(out.reason).toBe("Missing/invalid dpi")
    }
  })

  it("uploads, inserts with dpi, and activates", async () => {
    const capture: { insert?: InsertPayload } = {}
    const supabase = makeSupabase({ error: null }, capture)
    uploadSpy.mockResolvedValueOnce({ error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" })

    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 400.9,
      heightPx: 200.1,
      format: "png",
      dpi: 300.4,
    })

    expect(out.ok).toBe(true)
    expect(uploadSpy).toHaveBeenCalledTimes(1)
    expect(capture.insert?.dpi).toBe(300)
    expect(capture.insert?.width_px).toBe(400)
    expect(capture.insert?.height_px).toBe(200)
    expect(activateSpy).toHaveBeenCalledTimes(1)
  })
})
