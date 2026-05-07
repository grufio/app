import { describe, it, expect, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { resetProjectFilterChain } from "./filter-chain-reset"

type FilterRow = { id: string; output_image_id: string }

/**
 * Tests use the shared `makeMockSupabase` factory (lib/supabase/__mocks__/).
 * Migrated 2026-05-07 from a per-file hand-rolled `from()`-chain — see
 * the C1 PR notes for the migration rationale (mock-drift across tests
 * when the production code grew a new chain method).
 */
function setup(args: {
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

  const supabase = makeMockSupabase({
    tables: {
      project_image_filters: {
        select: () => ({
          data: args.rows,
          error: args.selectErr ?? null,
          onCall: () => {
            calls.selectFilters += 1
          },
        }),
        delete: () => ({
          data: null,
          error: args.deleteErr ?? null,
          onCall: () => {
            calls.deleteFilters += 1
          },
        }),
      },
      project_images: {
        // Storage-path lookup before the tombstone update — return empty
        // so the storage-cleanup loop short-circuits and the service-
        // role client never instantiates.
        select: { data: [], error: null },
        update: {
          data: null,
          error: args.updateErr ?? null,
          onCall: ({ args: chainArgs }) => {
            // The terminal in the production code is `.in("id", ids)` —
            // chainArgs records each chain invocation as its arg array.
            // We pluck the in() invocation by looking for [string, array].
            for (const callArgs of chainArgs as unknown[][]) {
              if (callArgs.length === 2 && Array.isArray(callArgs[1])) {
                calls.updateImagesIds = callArgs[1] as string[]
              }
            }
          },
        },
      },
    },
  })

  return { supabase, calls }
}

describe("resetProjectFilterChain", () => {
  it("returns no-op result when no filter rows exist", async () => {
    const { supabase, calls } = setup({ rows: [] })
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
    const { supabase, calls } = setup({
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
    const { supabase, calls } = setup({
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
    const { supabase } = setup({
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
    const { supabase } = setup({
      rows: [{ id: "f1", output_image_id: "out-1" }],
      deleteErr: { message: "del-fail" },
    })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("del-fail")
  })

  it("propagates update error", async () => {
    const { supabase } = setup({
      rows: [{ id: "f1", output_image_id: "out-1" }],
      updateErr: { message: "upd-fail" },
    })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("upd-fail")
  })

  it("skips output update when all rows have empty output_image_id", async () => {
    const { supabase, calls } = setup({
      rows: [{ id: "f1", output_image_id: "" }],
    })
    const result = await resetProjectFilterChain({ supabase, projectId: "p1" })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.softDeletedOutputs).toBe(0)
    expect(calls.updateImagesIds).toEqual([])
  })
})

// Silence unused-import warning until we add a vi.spyOn assertion.
void vi
