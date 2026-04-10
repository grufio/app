import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { uploadMasterImage } from "./master-image-upload"

const uploadSpy = vi.fn()
const removeSpy = vi.fn()
const activateSpy = vi.fn()

type InsertPayload = Record<string, unknown>

type MakeSupabaseOpts = {
  insertError?: { message: string; code?: string } | null
  insertErrors?: Array<{ message: string; code?: string } | null>
  selectData?: Array<{ id: string; storage_bucket?: string | null; storage_path?: string | null }>
  selectError?: { message: string; code?: string } | null
  deleteError?: { message: string; code?: string } | null
  stateRow?: Record<string, unknown> | null
  upsertStateError?: { message: string; code?: string } | null
  capture: { inserts: InsertPayload[]; deletes: number; stateUpserts: number }
}

vi.mock("@/lib/supabase/project-images", () => ({
  activateMasterWithState: (...args: unknown[]) => activateSpy(...args),
}))

function makeSupabase(opts: MakeSupabaseOpts) {
  const {
    capture,
    insertError = null,
    insertErrors = [],
    selectData = [],
    selectError = null,
    deleteError = null,
    stateRow = {
      x_px_u: "0",
      y_px_u: "0",
      width_px_u: "1000000",
      height_px_u: "1000000",
      rotation_deg: 0,
    },
    upsertStateError = null,
  } = opts
  let insertCall = 0
  const from = (table: string) => {
    if (table === "project_image_state") {
      return {
        select: () => {
          const chain = {
            eq: () => chain,
            maybeSingle: async () => ({
              data: stateRow,
              error: null,
            }),
          }
          return chain
        },
        upsert: async () => {
          capture.stateUpserts += 1
          return { error: upsertStateError }
        },
      }
    }
    return {
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
        capture.inserts.push(payload)
        const nextError = insertCall < insertErrors.length ? insertErrors[insertCall] : insertError
        insertCall += 1
        return { error: nextError }
      },
      delete: () => {
        capture.deletes += 1
        const chain = {
          eq: () => chain,
          is: async () => ({ error: deleteError }),
        }
        return chain
      },
    }
  }

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
    const supabase = makeSupabase({ capture: { inserts: [], deletes: 0, stateUpserts: 0 } })
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
    const supabase = makeSupabase({ capture: { inserts: [], deletes: 0, stateUpserts: 0 } })
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
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0 }
    const supabase = makeSupabase({
      capture,
      selectData: [{ id: "master-old", storage_bucket: "project_images", storage_path: "projects/p1/images/master-old" }],
    })
    uploadSpy.mockResolvedValue({ error: null })
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
    expect(uploadSpy).toHaveBeenCalledTimes(2)
    expect(capture.inserts).toHaveLength(2)
    const masterInsert = capture.inserts.find((row) => row.kind === "master")
    const workingInsert = capture.inserts.find((row) => row.kind === "working_copy")
    expect(masterInsert?.dpi_x).toBe(300)
    expect(masterInsert?.dpi_y).toBe(300)
    expect(masterInsert?.dpi).toBe(300)
    expect(masterInsert?.bit_depth).toBe(8)
    expect(masterInsert?.width_px).toBe(400)
    expect(masterInsert?.height_px).toBe(200)
    expect(workingInsert?.role).toBe("asset")
    expect(workingInsert?.source_image_id).toBe(masterInsert?.id)
    expect(activateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        imageId: masterInsert?.id,
        widthPx: 400,
        heightPx: 200,
      })
    )
    expect(capture.stateUpserts).toBe(1)
    expect(capture.deletes).toBeGreaterThanOrEqual(1)
    expect(activateSpy).toHaveBeenCalledTimes(1)
  })

  it("rolls back inserted row and storage object when activation fails", async () => {
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0 }
    const supabase = makeSupabase({ capture, selectData: [] })
    uploadSpy.mockResolvedValue({ error: null })
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
    expect(capture.stateUpserts).toBe(0)
    expect(removeSpy).toHaveBeenCalled()
  })

  it("rolls back when working_copy insert fails after master insert", async () => {
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0 }
    const supabase = makeSupabase({
      capture,
      selectData: [],
      insertErrors: [null, { message: "working copy insert failed", code: "23505" }],
    })
    uploadSpy.mockResolvedValue({ error: null })
    removeSpy.mockResolvedValue({ error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })
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

    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("db_upsert")
      expect(out.reason).toContain("working copy insert failed")
    }
    expect(capture.inserts).toHaveLength(2)
    expect(capture.stateUpserts).toBe(0)
    expect(capture.deletes).toBeGreaterThanOrEqual(1)
    expect(removeSpy).toHaveBeenCalled()
  })

  it("rolls back when master->working transform copy cannot be created", async () => {
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0 }
    const supabase = makeSupabase({
      capture,
      selectData: [],
      stateRow: null,
    })
    uploadSpy.mockResolvedValue({ error: null })
    removeSpy.mockResolvedValue({ error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })
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

    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("db_upsert")
      expect(out.reason).toContain("Source image transform is missing")
    }
    expect(capture.inserts).toHaveLength(2)
    expect(capture.stateUpserts).toBe(0)
    expect(capture.deletes).toBeGreaterThanOrEqual(2)
    expect(removeSpy).toHaveBeenCalled()
  })

  it("rolls back when transform upsert fails", async () => {
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0 }
    const supabase = makeSupabase({
      capture,
      selectData: [],
      upsertStateError: { message: "state upsert failed", code: "23514" },
    })
    uploadSpy.mockResolvedValue({ error: null })
    removeSpy.mockResolvedValue({ error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })
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

    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("db_upsert")
      expect(out.reason).toContain("Failed to upsert target transform")
    }
    expect(capture.inserts).toHaveLength(2)
    expect(capture.stateUpserts).toBe(1)
    expect(capture.deletes).toBeGreaterThanOrEqual(2)
    expect(removeSpy).toHaveBeenCalled()
  })
})
