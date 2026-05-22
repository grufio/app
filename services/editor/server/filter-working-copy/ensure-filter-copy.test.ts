import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { ensureFilterWorkingCopyExists } from "./ensure-filter-copy"

// Chain-reset and soft-delete are exercised by their own suites; here we
// stub them to drive ensure-filter-copy's branches deterministically.
const { resetMock, softDeleteMock } = vi.hoisted(() => ({
  resetMock: vi.fn(),
  softDeleteMock: vi.fn(),
}))
vi.mock("@/services/editor/server/filter-chain-reset", () => ({ resetProjectFilterChain: resetMock }))
vi.mock("./soft-delete-copies", () => ({ softDeleteCopies: softDeleteMock }))

const PROJECT = "project-1"
const source = {
  id: "src-1",
  storage_bucket: "project_images",
  storage_path: "projects/p/src.png",
  name: "Photo",
  format: "png",
  width_px: 800,
  height_px: 600,
  file_size_bytes: 1234,
}
const reusableCopy = {
  id: "reuse-1",
  storage_bucket: "project_images",
  storage_path: "projects/p/reuse.png",
  width_px: 800,
  height_px: 600,
  source_image_id: "src-1",
  name: "Photo (filter working)",
  updated_at: "2026-01-02T00:00:00Z",
  created_at: "2026-01-02T00:00:00Z",
}

function makeStorage(opts: { copyError?: { message?: string; code?: string } | null } = {}) {
  const copy = vi.fn(async () => ({ data: opts.copyError ? null : { path: "x" }, error: opts.copyError ?? null }))
  const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://signed.test/x" }, error: null }))
  const remove = vi.fn(async () => ({ data: null, error: null }))
  const storage = { from: vi.fn(() => ({ copy, createSignedUrl, remove })) }
  return { storage, copy, createSignedUrl, remove }
}

function makeSupabase(args: {
  copies?: Array<Record<string, unknown>>
  selectError?: { message: string; code?: string }
  insertError?: { message: string; code?: string } | null
}) {
  const inserted: Array<Record<string, unknown>> = []
  const supabase = makeMockSupabase({
    tables: {
      project_images: {
        select: args.selectError ? { error: args.selectError } : { data: args.copies ?? [] },
        insert: { error: args.insertError ?? null, onCall: (c) => { inserted.push(c.opArgs[0] as Record<string, unknown>) } },
      },
    },
  })
  return { supabase, inserted }
}

function attachStorage(supabase: ReturnType<typeof makeSupabase>["supabase"], s: ReturnType<typeof makeStorage>) {
  ;(supabase as unknown as { storage: unknown }).storage = s.storage
}

beforeEach(() => {
  resetMock.mockResolvedValue({ ok: true, deletedFilterRows: 0, softDeletedOutputs: 0 })
  softDeleteMock.mockResolvedValue({ ok: true })
})
afterEach(() => {
  resetMock.mockClear()
  softDeleteMock.mockClear()
})

describe("ensureFilterWorkingCopyExists", () => {
  it("returns working_copy_exists when the candidate query fails", async () => {
    const { supabase } = makeSupabase({ selectError: { message: "db boom" } })
    attachStorage(supabase, makeStorage())
    expect(await ensureFilterWorkingCopyExists({ supabase, projectId: PROJECT, source })).toMatchObject({
      ok: false,
      stage: "working_copy_exists",
    })
  })

  it("reuses an existing copy without creating a new one", async () => {
    const { supabase, inserted } = makeSupabase({ copies: [reusableCopy] })
    const storage = makeStorage()
    attachStorage(supabase, storage)

    const res = await ensureFilterWorkingCopyExists({ supabase, projectId: PROJECT, source })
    expect(res).toMatchObject({ ok: true, id: "reuse-1", created: false })
    expect(inserted).toHaveLength(0)
    expect(storage.copy).not.toHaveBeenCalled()
    // No obsolete duplicates -> chain reset not needed.
    expect(resetMock).not.toHaveBeenCalled()
  })

  it("tombstones obsolete duplicates (reset + soft-delete) before reusing", async () => {
    const duplicate = { ...reusableCopy, id: "dup-1", updated_at: "2025-01-01T00:00:00Z", created_at: "2025-01-01T00:00:00Z" }
    const { supabase } = makeSupabase({ copies: [reusableCopy, duplicate] })
    attachStorage(supabase, makeStorage())

    const res = await ensureFilterWorkingCopyExists({ supabase, projectId: PROJECT, source })
    expect(res).toMatchObject({ ok: true, id: "reuse-1", created: false })
    expect(resetMock).toHaveBeenCalledOnce()
    expect(softDeleteMock).toHaveBeenCalledWith(supabase, ["dup-1"])
  })

  it("creates a new copy when none is reusable", async () => {
    const { supabase, inserted } = makeSupabase({ copies: [] })
    const storage = makeStorage()
    attachStorage(supabase, storage)

    const res = await ensureFilterWorkingCopyExists({ supabase, projectId: PROJECT, source })
    expect(res).toMatchObject({ ok: true, created: true, sourceImageId: "src-1" })
    expect(storage.copy).toHaveBeenCalledOnce()
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ kind: "filter_working_copy", source_image_id: "src-1", name: "Photo (filter working)" })
  })

  it("returns storage_copy when the server-side copy fails", async () => {
    const { supabase } = makeSupabase({ copies: [] })
    attachStorage(supabase, makeStorage({ copyError: { message: "copy fail" } }))
    expect(await ensureFilterWorkingCopyExists({ supabase, projectId: PROJECT, source })).toMatchObject({
      ok: false,
      stage: "storage_copy",
    })
  })

  it("returns db_insert and removes the copied object when the row insert fails", async () => {
    const { supabase } = makeSupabase({ copies: [], insertError: { message: "insert fail", code: "23505" } })
    const storage = makeStorage()
    attachStorage(supabase, storage)

    const res = await ensureFilterWorkingCopyExists({ supabase, projectId: PROJECT, source })
    expect(res).toMatchObject({ ok: false, stage: "db_insert" })
    expect(storage.remove).toHaveBeenCalledOnce()
  })

  it("returns soft_delete when the chain reset fails on the create path", async () => {
    resetMock.mockResolvedValueOnce({ ok: false, reason: "reset boom", code: "R1" })
    const { supabase } = makeSupabase({ copies: [] })
    attachStorage(supabase, makeStorage())
    expect(await ensureFilterWorkingCopyExists({ supabase, projectId: PROJECT, source })).toMatchObject({
      ok: false,
      stage: "soft_delete",
      reason: "reset boom",
    })
  })
})
