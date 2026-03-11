import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { uploadMasterImage } from "./master-image-upload"

const uploadSpy = vi.fn()
const removeSpy = vi.fn()
const activateSpy = vi.fn()

type InsertPayload = Record<string, unknown>

type MakeSupabaseOpts = {
  insertError?: { message: string; code?: string } | null
  selectData?: Array<{ id: string; storage_bucket?: string | null; storage_path?: string | null }>
  selectError?: { message: string; code?: string } | null
  deleteError?: { message: string; code?: string } | null
  capture: { insert?: InsertPayload; deletes: number }
}

vi.mock("@/lib/supabase/project-images", () => ({
  activateMasterWithState: (...args: unknown[]) => activateSpy(...args),
}))

function makeSupabase(opts: MakeSupabaseOpts) {
  const { capture, insertError = null, selectData = [], selectError = null, deleteError = null } = opts
  const from = () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          is: async () => ({
            data: selectData,
            error: selectError,
          }),
        }),
      }),
    }),
    insert: async (payload: InsertPayload) => {
      capture.insert = payload
      return { error: insertError }
    },
    delete: () => {
      capture.deletes += 1
      const chain = {
        eq: () => chain,
        is: async () => ({ error: deleteError }),
      }
      return chain
    },
  })

  return {
    storage: {
      from: () => ({
        upload: uploadSpy,
        remove: removeSpy,
      }),
    },
    from,
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
    const supabase = makeSupabase({ capture: { deletes: 0 } })
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" })
    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 0,
      heightPx: 10,
      format: "png",
      dpi: 72,
      bitDepth: 8,
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("validation")
      expect(out.status).toBe(400)
    }
  })

  it("applies upload limits from env", async () => {
    process.env.USER_MAX_UPLOAD_BYTES = "1"
    const supabase = makeSupabase({ capture: { deletes: 0 } })
    const file = new File([new Uint8Array([1, 2])], "x.png", { type: "image/png" })

    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 10,
      heightPx: 10,
      dpi: 72,
      bitDepth: 8,
      format: "png",
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("upload_limits")
      expect(out.status).toBe(413)
    }
  })

  it("replaces existing master rows, inserts, and activates", async () => {
    const capture = { deletes: 0 }
    const supabase = makeSupabase({
      capture,
      selectData: [{ id: "master-old", storage_bucket: "project_images", storage_path: "projects/p1/images/master-old" }],
    })
    uploadSpy.mockResolvedValueOnce({ error: null })
    removeSpy.mockResolvedValue({ error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" })

    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 400.9,
      heightPx: 200.1,
      dpi: 300,
      bitDepth: 8,
      format: "png",
    })

    expect(out.ok).toBe(true)
    expect(uploadSpy).toHaveBeenCalledTimes(1)
    expect(capture.insert?.dpi_x).toBe(300)
    expect(capture.insert?.dpi_y).toBe(300)
    expect(capture.insert?.dpi).toBe(300)
    expect(capture.insert?.bit_depth).toBe(8)
    expect(capture.insert?.width_px).toBe(400)
    expect(capture.insert?.height_px).toBe(200)
    expect(capture.deletes).toBeGreaterThanOrEqual(1)
    expect(activateSpy).toHaveBeenCalledTimes(1)
  })

  it("rolls back inserted row and storage object when activation fails", async () => {
    const capture = { deletes: 0 }
    const supabase = makeSupabase({ capture, selectData: [] })
    uploadSpy.mockResolvedValueOnce({ error: null })
    removeSpy.mockResolvedValue({ error: null })
    activateSpy.mockResolvedValueOnce({
      ok: false,
      status: 409,
      stage: "lock_conflict",
      reason: "Active image is locked",
      code: "image_locked",
    })
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" })

    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 200,
      heightPx: 100,
      dpi: 72,
      bitDepth: 8,
      format: "png",
    })

    expect(out).toEqual({
      ok: false,
      status: 409,
      stage: "lock_conflict",
      reason: "Active image is locked",
      code: "image_locked",
    })
    expect(capture.deletes).toBeGreaterThanOrEqual(1)
    expect(removeSpy).toHaveBeenCalled()
  })
})
