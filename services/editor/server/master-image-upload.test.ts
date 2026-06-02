import { beforeEach, describe, expect, it, vi } from "vitest"
import sharp from "sharp"

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

/**
 * Build a REAL, sharp-readable image File so the service's server-side
 * sharp extraction has genuine bytes to read width/height/density from.
 * `density` is embedded (PNG pHYs / JPEG JFIF) and must round-trip through
 * `sharp.metadata().density`.
 */
async function makeImageFile(opts: {
  width: number
  height: number
  density?: number
  format?: "png" | "jpeg"
}): Promise<File> {
  const { width, height, density, format = "png" } = opts
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
  pipeline = format === "jpeg" ? pipeline.jpeg() : pipeline.png()
  if (density) pipeline = pipeline.withMetadata({ density })
  const buf = await pipeline.toBuffer()
  return new File([new Uint8Array(buf)], `x.${format}`, { type: `image/${format}` })
}

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

  it("rejects an unreadable image file with validation/400 (sharp cannot parse)", async () => {
    const supabase = makeSupabase({ capture: { inserts: [], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 } })
    const file = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" })
    const out = await uploadMasterImage({ supabase: supabase as never, projectId: "p1", file, format: "png" })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("validation")
      expect(out.status).toBe(400)
    }
    // Never touched storage — rejected before upload.
    expect(uploadSpy).not.toHaveBeenCalled()
  })

  it("applies upload limits from env (before storage upload)", async () => {
    process.env.USER_MAX_UPLOAD_BYTES = "1"
    const supabase = makeSupabase({ capture: { inserts: [], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 } })
    const file = await makeImageFile({ width: 10, height: 10 })

    const out = await uploadMasterImage({ supabase: supabase as never, projectId: "p1", file, format: "png" })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.stage).toBe("upload_limits")
      expect(out.status).toBe(413)
    }
    expect(uploadSpy).not.toHaveBeenCalled()
  })

  it("derives width/height/DPI from the file via sharp, then inserts + activates", async () => {
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 }
    const supabase = makeSupabase({
      capture,
      selectData: [{ id: "master-old", storage_bucket: "project_images", storage_path: "projects/p1/images/master-old" }],
    })
    uploadSpy.mockResolvedValue({ error: null })
    removeSpy.mockResolvedValue({ error: null })
    createSignedUrlSpy.mockResolvedValue({ data: { signedUrl: "https://signed/master" }, error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })
    // Real 400×200 PNG carrying a 300-DPI pHYs chunk — the server reads
    // these, NOT any client-sent values.
    const file = await makeImageFile({ width: 400, height: 200, density: 300 })

    const out = await uploadMasterImage({ supabase: supabase as never, projectId: "p1", file, format: "png" })

    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.master.signedUrl).toBe("https://signed/master")
      expect(out.master.width_px).toBe(400)
      expect(out.master.height_px).toBe(200)
      expect(out.master.dpi).toBe(300)
    }
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

  it("reads JFIF density from a JPEG (240 → dpi 240)", async () => {
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 }
    const supabase = makeSupabase({ capture, selectData: [] })
    uploadSpy.mockResolvedValue({ error: null })
    createSignedUrlSpy.mockResolvedValue({ data: { signedUrl: "https://signed/master" }, error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })
    const file = await makeImageFile({ width: 120, height: 90, density: 240, format: "jpeg" })

    const out = await uploadMasterImage({ supabase: supabase as never, projectId: "p1", file, format: "jpeg" })
    expect(out.ok).toBe(true)
    const masterInsert = capture.inserts.find((row) => row.kind === "master")
    expect(masterInsert?.width_px).toBe(120)
    expect(masterInsert?.height_px).toBe(90)
    expect(masterInsert?.dpi).toBe(240)
  })

  it("normalises EXIF Orientation: post-rotate dims persisted, uploaded bytes have no Orientation tag", async () => {
    // Build a JPEG that's 10 px wide × 20 px tall in raw bytes, with the
    // EXIF Orientation=6 tag (camera held portrait → rotate 90° CW for
    // display). The upload pipeline must call sharp().rotate() to bake
    // the rotation into the pixel data, yielding a 20×10 image with no
    // residual Orientation tag.
    const rawWidth = 10
    const rawHeight = 20
    const inputBuf = await sharp({
      create: { width: rawWidth, height: rawHeight, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const file = new File([new Uint8Array(inputBuf)], "portrait.jpg", { type: "image/jpeg" })

    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 }
    const supabase = makeSupabase({ capture, selectData: [] })
    uploadSpy.mockResolvedValue({ error: null })
    createSignedUrlSpy.mockResolvedValue({ data: { signedUrl: "https://signed/master" }, error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })

    const out = await uploadMasterImage({
      supabase: supabase as never,
      projectId: "p1",
      file,
      format: "jpeg",
    })
    expect(out.ok).toBe(true)

    // DB row reflects display dimensions (rotated), not the raw byte dims.
    const masterInsert = capture.inserts.find((row) => row.kind === "master")
    expect(masterInsert?.width_px).toBe(rawHeight) // 20
    expect(masterInsert?.height_px).toBe(rawWidth) // 10

    // The buffer handed to Storage is the rotated buffer — re-decoding it
    // confirms the Orientation tag is gone and the bytes ARE 20×10.
    const storageCall = uploadSpy.mock.calls[0]
    const uploadedBuf = storageCall?.[1] as Buffer | undefined
    expect(uploadedBuf).toBeDefined()
    const uploadedMeta = await sharp(uploadedBuf!).metadata()
    expect(uploadedMeta.width).toBe(rawHeight) // 20
    expect(uploadedMeta.height).toBe(rawWidth) // 10
    expect(uploadedMeta.orientation == null || uploadedMeta.orientation === 1).toBe(true)

    // file_size_bytes is the rotated buffer's length, not the original file.
    expect(masterInsert?.file_size_bytes).toBe(uploadedBuf!.byteLength)
  })

  it("falls back to dpi=72 when the image carries no density", async () => {
    const capture = { inserts: [] as InsertPayload[], deletes: 0, stateUpserts: 0, cleanupRpcCalls: 0 }
    const supabase = makeSupabase({ capture, selectData: [] })
    uploadSpy.mockResolvedValue({ error: null })
    createSignedUrlSpy.mockResolvedValue({ data: { signedUrl: "https://signed/master" }, error: null })
    activateSpy.mockResolvedValueOnce({ ok: true })
    const file = await makeImageFile({ width: 50, height: 40 }) // no density

    const out = await uploadMasterImage({ supabase: supabase as never, projectId: "p1", file, format: "png" })
    expect(out.ok).toBe(true)
    const masterInsert = capture.inserts.find((row) => row.kind === "master")
    expect(masterInsert?.dpi).toBe(72)
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
    const file = await makeImageFile({ width: 200, height: 100 })

    const out = await uploadMasterImage({ supabase: supabase as never, projectId: "p1", file, format: "png" })

    expect(out).toEqual({
      ok: false,
      status: 409,
      stage: "lock_conflict",
      reason: "Active image is locked",
      code: "image_locked",
    })
    expect(capture.cleanupRpcCalls).toBe(0)
    expect(capture.stateUpserts).toBe(0)
    expect(removeSpy).toHaveBeenCalled()
  })
})
