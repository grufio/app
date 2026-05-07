import { describe, it, expect, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import { resetProjectFilterChain } from "./filter-chain-reset"

type FilterRow = { id: string; output_image_id: string }

function makeSupabase(args: {
  rows: FilterRow[]
  selectErr?: { message: string; code?: string } | null
  deleteErr?: { message: string; code?: string } | null
  updateErr?: { message: string; code?: string } | null
}) {
  const calls = {
    selectFilters: 0,
    deleteFilters: 0,
    updateImagesIds: [] as string[],
  }

  const from = vi.fn((table: string) => {
    if (table === "project_image_filters") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => {
            calls.selectFilters += 1
            return args.selectErr
              ? { data: null, error: args.selectErr }
              : { data: args.rows, error: null }
          }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => {
            calls.deleteFilters += 1
            return args.deleteErr ? { error: args.deleteErr } : { error: null }
          }),
        })),
      }
    }
    if (table === "project_images") {
      return {
        // The chain calls .select(...).eq().eq().is().in() to look up
        // (storage_bucket, storage_path) before the tombstone update so
        // it can clean up storage objects synchronously. In tests we
        // return empty rows — the storage-cleanup loop short-circuits
        // and the service-role client never instantiates.
        select: vi.fn(() => {
          const chain: Record<string, unknown> = {}
          chain.eq = vi.fn(() => chain)
          chain.is = vi.fn(() => chain)
          chain.in = vi.fn(async () => ({ data: [], error: null }))
          return chain
        }),
        update: vi.fn(() => {
          const chain: Record<string, unknown> = {}
          chain.eq = vi.fn(() => chain)
          chain.is = vi.fn(() => chain)
          chain.in = vi.fn(async (_key: string, ids: string[]) => {
            calls.updateImagesIds = ids
            return args.updateErr ? { error: args.updateErr } : { error: null }
          })
          return chain
        }),
      }
    }
    return {}
  })

  return {
    supabase: { from } as unknown as SupabaseClient<Database>,
    calls,
  }
}

describe("resetProjectFilterChain", () => {
  it("returns no-op result when no filter rows exist", async () => {
    const { supabase, calls } = makeSupabase({ rows: [] })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.deletedFilterRows).toBe(0)
      expect(result.softDeletedOutputs).toBe(0)
    }
    expect(calls.deleteFilters).toBe(0)
    expect(calls.updateImagesIds).toEqual([])
  })

  it("deletes filter rows and soft-deletes their outputs", async () => {
    const { supabase, calls } = makeSupabase({
      rows: [
        { id: "f1", output_image_id: "out-1" },
        { id: "f2", output_image_id: "out-2" },
      ],
    })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.deletedFilterRows).toBe(2)
      expect(result.softDeletedOutputs).toBe(2)
    }
    expect(calls.deleteFilters).toBe(1)
    expect(calls.updateImagesIds.sort()).toEqual(["out-1", "out-2"])
  })

  it("deduplicates output image ids before update", async () => {
    const { supabase, calls } = makeSupabase({
      rows: [
        { id: "f1", output_image_id: "out-x" },
        { id: "f2", output_image_id: "out-x" },
      ],
    })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(true)
    expect(calls.updateImagesIds).toEqual(["out-x"])
  })

  it("propagates select error", async () => {
    const { supabase } = makeSupabase({
      rows: [],
      selectErr: { message: "boom", code: "X" },
    })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("boom")
      expect(result.code).toBe("X")
    }
  })

  it("propagates delete error", async () => {
    const { supabase } = makeSupabase({
      rows: [{ id: "f1", output_image_id: "out-1" }],
      deleteErr: { message: "del-fail" },
    })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("del-fail")
  })

  it("propagates update error", async () => {
    const { supabase } = makeSupabase({
      rows: [{ id: "f1", output_image_id: "out-1" }],
      updateErr: { message: "upd-fail" },
    })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("upd-fail")
  })

  it("skips output update when all rows have empty output_image_id", async () => {
    const { supabase, calls } = makeSupabase({
      rows: [{ id: "f1", output_image_id: "" }],
    })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.softDeletedOutputs).toBe(0)
    expect(calls.updateImagesIds).toEqual([])
  })
})
