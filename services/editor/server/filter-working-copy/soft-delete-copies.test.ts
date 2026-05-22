import { afterEach, describe, expect, it, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { softDeleteCopies } from "./soft-delete-copies"

// Storage removal of tombstoned rows runs through the service-role client
// (owner RLS denies it once deleted_at is set). Mock that client's remove.
const { removeMock } = vi.hoisted(() => ({ removeMock: vi.fn(async () => ({ data: null, error: null })) }))
vi.mock("@/lib/supabase/service-role", () => ({
  createSupabaseServiceRoleClient: () => ({ storage: { from: () => ({ remove: removeMock }) } }),
}))

afterEach(() => removeMock.mockClear())

function withRows(rows: Array<Record<string, unknown>>, updateError: { message: string; code?: string } | null = null) {
  return makeMockSupabase({
    tables: { project_images: { select: { data: rows }, update: { error: updateError } } },
  })
}

describe("softDeleteCopies", () => {
  it("returns ok immediately for an empty id list (no DB/storage calls)", async () => {
    expect(await softDeleteCopies(makeMockSupabase(), [])).toEqual({ ok: true })
    expect(removeMock).not.toHaveBeenCalled()
  })

  it("surfaces the tombstone update error", async () => {
    const supabase = withRows([{ id: "i1", storage_bucket: "project_images", storage_path: "p1" }], { message: "boom", code: "X1" })
    expect(await softDeleteCopies(supabase, ["i1"])).toMatchObject({ ok: false, reason: "boom", code: "X1" })
    expect(removeMock).not.toHaveBeenCalled()
  })

  it("tombstones rows and removes their storage objects via the service role", async () => {
    const supabase = withRows([
      { id: "i1", storage_bucket: "project_images", storage_path: "p1" },
      { id: "i2", storage_bucket: "project_images", storage_path: "p2" },
    ])
    expect(await softDeleteCopies(supabase, ["i1", "i2"])).toEqual({ ok: true })
    expect(removeMock).toHaveBeenCalledTimes(2)
    expect(removeMock).toHaveBeenCalledWith(["p1"])
    expect(removeMock).toHaveBeenCalledWith(["p2"])
  })

  it("skips storage removal for rows without a storage_path", async () => {
    const supabase = withRows([{ id: "i1", storage_bucket: "project_images", storage_path: null }])
    expect(await softDeleteCopies(supabase, ["i1"])).toEqual({ ok: true })
    expect(removeMock).not.toHaveBeenCalled()
  })

  it("stays ok even when a per-row storage remove throws (best-effort sweep)", async () => {
    removeMock.mockRejectedValueOnce(new Error("storage down"))
    const supabase = withRows([{ id: "i1", storage_bucket: "project_images", storage_path: "p1" }])
    expect(await softDeleteCopies(supabase, ["i1"])).toEqual({ ok: true })
  })
})
