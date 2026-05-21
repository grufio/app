import { beforeEach, describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { uploadMasterImage } from "./master-image-upload"

// Storage spies are module-level so individual tests can attach
// mockResolvedValue / mockResolvedValueOnce per scenario. The factory's
// own storage handlers don't expose the underlying vi.fn for external
// configuration, so we plug these in by overriding `supabase.storage`.
const uploadSpy = vi.fn()
const removeSpy = vi.fn()
const createSignedUrlSpy = vi.fn()
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
  /** Rows that the master-cleanup RPC reports as removed (storage
   * paths for cleanup). When `null`, the RPC mock returns `data: null`
   * to simulate an empty project. */
  cleanupRpcData?: Array<{ storage_bucket: string | null; storage_path: string | null }> | null
  capture: {
    inserts: InsertPayload[]
    deletes: number
    stateUpserts: number
    cleanupRpcCalls: number
  }
}

vi.mock("@/services/editor/server/activate-project-image", () => ({
  activateProjectMasterAndWorkingCopy: (...args: unknown[]) => activateSpy(...args),
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
    cleanupRpcData = null,
  } = opts
  let insertCall = 0

  // Master cleanup now goes through `delete_master_with_cascade`
  // (server-side cascade with `app.deleting_project` GUC), so the
  // mock spies on the RPC call and returns the configured rowset.
  // `selectData` is retained for any code path that still does a
  // direct `select` (none in the current flow), but the cleanup
  // count moves to `cleanupRpcCalls`.
  const supabase = makeMockSupabase({
    tables: {
      project_images: {
        select: ({ ops }) => {
          if (ops.includes("maybeSingle") || ops.includes("single")) {
            return { data: selectData[0] ?? null, error: selectError }
          }
          return { data: selectData, error: selectError }
        },
        insert: ({ opArgs }) => {
          const payload = opArgs[0] as InsertPayload
          capture.inserts.push(payload)
          const nextError = insertCall < insertErrors.length ? insertErrors[insertCall] : insertError
          insertCall += 1
          if (nextError) return { data: null, error: nextError }
          // Mimic `.select("*").single()` chained after insert: return
          // the just-inserted row so master-image-upload can build the
          // snapshot from in-memory state without a re-select.
          return { data: payload, error: null }
        },
        delete: () => {
          capture.deletes += 1
          return { data: null, error: deleteError ?? null }
        },
      },
      project_image_state: {
        select: { data: stateRow, error: null },
        upsert: () => {
          capture.stateUpserts += 1
          return { data: null, error: upsertStateError ?? null }
        },
      },
    },
    rpcs: {
      delete_master_with_cascade: {
        data: cleanupRpcData,
        error: deleteError ?? null,
        onCall: () => {
          capture.cleanupRpcCalls += 1
        },
      },
    },
  })

  // Override the factory-provided storage handlers with the external
  // spies so each test can configure them via `mockResolvedValue` etc.
  supabase.storage = {
    from: () => ({
      upload: uploadSpy,
      remove: removeSpy,
      createSignedUrl: createSignedUrlSpy,
    }),
  } as unknown as typeof supabase.storage

  return supabase
}

describe("master-image-upload service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.USER_MAX_UPLOAD_BYTES
    delete process.env.USER_ALLOWED_UPLOAD_MIME
    delete process.env.USER_UPLOAD_MAX_PIXELS
  })

  it("rejects invalid dimensions with validation stage", async () => {
    const supabase = makeSupabase({ capture: { inserts: [], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 } })
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" })
    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 0,
      heightPx: 10,
      format: "png",
      dpi: 72,
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("validation")
      expect(out.status).toBe(400)
    }
  })

  it("applies upload limits from env", async () => {
    process.env.USER_MAX_UPLOAD_BYTES = "1"
    const supabase = makeSupabase({ capture: { inserts: [], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 } })
    const file = new File([new Uint8Array([1, 2])], "x.png", { type: "image/png" })

    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 10,
      heightPx: 10,
      dpi: 72,
      format: "png",
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("upload_limits")
      expect(out.status).toBe(413)
    }
  })

  it("replaces existing master rows, inserts, and activates", async () => {
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 }
    const supabase = makeSupabase({
      capture,
      selectData: [{ id: "master-old", storage_bucket: "project_images", storage_path: "projects/p1/images/master-old" }],
    })
    uploadSpy.mockResolvedValue({ error: null })
    removeSpy.mockResolvedValue({ error: null })
    createSignedUrlSpy.mockResolvedValue({ data: { signedUrl: "https://signed/master" }, error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" })

    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      widthPx: 400.9,
      heightPx: 200.1,
      dpi: 300,
      format: "png",
    })

    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.master.signedUrl).toBe("https://signed/master")
      expect(out.master.width_px).toBe(400)
      expect(out.master.height_px).toBe(200)
      expect(out.master.dpi).toBe(300)
    }
    // Eager working-copy: master upload writes the master file once
    // (working_copy shares storage_path) and inserts BOTH the master
    // row and the working_copy row. The working_copy is the editable
    // anchor; the master row is immutable.
    expect(uploadSpy).toHaveBeenCalledTimes(1)
    expect(capture.inserts).toHaveLength(2)
    const masterInsert = capture.inserts.find((row) => row.kind === "master")
    expect(masterInsert?.dpi).toBe(300)
    expect(masterInsert?.width_px).toBe(400)
    expect(masterInsert?.height_px).toBe(200)
    const workingCopyInsert = capture.inserts.find((row) => row.kind === "working_copy")
    expect(workingCopyInsert?.source_image_id).toBe(masterInsert?.id)
    expect(workingCopyInsert?.storage_path).toBe(masterInsert?.storage_path)
    expect(workingCopyInsert?.width_px).toBe(400)
    expect(workingCopyInsert?.height_px).toBe(200)
    expect(activateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        masterImageId: masterInsert?.id,
        workingCopyImageId: workingCopyInsert?.id,
        widthPx: 400,
        heightPx: 200,
      })
    )
    expect(capture.stateUpserts).toBe(0)
    expect(capture.cleanupRpcCalls).toBeGreaterThanOrEqual(1)
    expect(activateSpy).toHaveBeenCalledTimes(1)
  })

  it("rolls back inserted row and storage object when activation fails", async () => {
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 }
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
      format: "png",
    })

    expect(out).toEqual({
      ok: false,
      status: 409,
      stage: "lock_conflict",
      reason: "Active image is locked",
      code: "image_locked",
    })
    // First-upload (selectData=[]): cleanup cascade is skipped — no
    // prior master to delete. Test focus is the rollback path, not the
    // cleanup path; cleanup behaviour is exercised by the "replaces"
    // test above.
    expect(capture.cleanupRpcCalls).toBe(0)
    expect(capture.stateUpserts).toBe(0)
    expect(removeSpy).toHaveBeenCalled()
  })

  // Pre-refactor: master upload seeded a project_image_state row for
  // the working copy. After anchoring state at master.id, no pre-seed
  // is needed — the editor's first placement creates the row on
  // demand. Tests for the old "transform_sync" failure path were
  // removed because copyImageTransform no longer runs in this flow.
  //
  // Post-lazy-working-copy: the working-copy insert no longer runs in
  // the upload flow at all (it's lazy on first filter-apply via
  // `working-copy/ensure.ts`). The "working_copy insert fails" rollback
  // test was deleted — that failure mode now lives in the ensure helper
  // and is exercised by `working-copy/ensure.test.ts`.
})
