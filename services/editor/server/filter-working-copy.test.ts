/**
 * Tests for filter working copy creation and management.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getOrCreateFilterWorkingCopy } from "./filter-working-copy"
import type { Database } from "@/lib/supabase/database.types"
import { copyImageTransform } from "./copy-image-transform"

vi.mock("./copy-image-transform", () => ({
  copyImageTransform: vi.fn(async () => ({ ok: true as const })),
}))

describe("getOrCreateFilterWorkingCopy", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const activeImageId = "active-image-id"
  const activeImage = {
    id: activeImageId,
    name: "test.jpg",
    storage_bucket: "project_images",
    storage_path: "path/to/active.jpg",
    format: "jpeg",
    width_px: 1000,
    height_px: 800,
    file_size_bytes: 50000,
    source_image_id: null,
  }

  function makeSupabase(args: {
    active?: Record<string, unknown> | null
    copies?: Array<Record<string, unknown>>
  }) {
    const removedIds: string[][] = []
    const insertedRows: Array<Record<string, unknown>> = []
    const queryState = { activeQuery: false, copyQuery: false }

    const from = vi.fn((table: string) => {
      if (table !== "project_images") return {}
      return {
        select: vi.fn(() => {
          const chain: Record<string, unknown> = {}
          chain.eq = vi.fn((key: string) => {
            if (key === "is_active") queryState.activeQuery = true
            if (key === "role") queryState.copyQuery = true
            return chain
          })
          chain.is = vi.fn(() => chain)
          chain.like = vi.fn(() => chain)
          chain.order = vi.fn(() => chain)
          chain.maybeSingle = vi.fn(async () => {
            if (queryState.activeQuery) {
              queryState.activeQuery = false
              return { data: args.active ?? null, error: null }
            }
            return { data: null, error: null }
          })
          chain.limit = vi.fn(async () => {
            if (queryState.copyQuery) {
              queryState.copyQuery = false
              return { data: args.copies ?? [], error: null }
            }
            return { data: [], error: null }
          })
          return chain
        }),
        update: vi.fn(() => ({
          in: vi.fn(async (_key: string, ids: string[]) => {
            removedIds.push(ids)
            return { error: null }
          }),
        })),
        insert: vi.fn(async (row: Record<string, unknown>) => {
          insertedRows.push(row)
          return { error: null }
        }),
      }
    })

    const storageFrom = vi.fn(() => ({
      download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })),
      upload: vi.fn(async () => ({ error: null })),
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed-url.test/img.jpg" }, error: null })),
      remove: vi.fn(async () => ({ error: null })),
    }))

    return {
      supabase: {
        from,
        storage: { from: storageFrom },
      } as unknown as SupabaseClient<Database>,
      removedIds,
      insertedRows,
    }
  }

  beforeEach(() => {
    mockSupabase = {} as SupabaseClient<Database>
    vi.mocked(copyImageTransform).mockClear()
  })

  it("returns existing reusable copy and cleans duplicates", async () => {
    const reusableId = "working-copy-id"
    const duplicateId = "duplicate-working-copy-id"
    const setup = makeSupabase({
      active: activeImage,
      copies: [
        {
          id: reusableId,
          storage_bucket: "project_images",
          storage_path: "path/to/working.jpg",
          width_px: 1000,
          height_px: 800,
          source_image_id: activeImageId,
          name: "test.jpg (filter working)",
          updated_at: "2026-01-01T00:00:00Z",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: duplicateId,
          storage_bucket: "project_images",
          storage_path: "path/to/duplicate.jpg",
          width_px: 1000,
          height_px: 800,
          source_image_id: activeImageId,
          name: "test.jpg (filter working)",
          updated_at: "2025-01-01T00:00:00Z",
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
    })
    mockSupabase = setup.supabase

    const result = await getOrCreateFilterWorkingCopy({ supabase: mockSupabase, projectId })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.id).toBe(reusableId)
      expect(result.sourceImageId).toBe(activeImageId)
    }
    expect(setup.removedIds).toEqual([[duplicateId]])
    expect(setup.insertedRows).toHaveLength(0)
    expect(copyImageTransform).toHaveBeenCalledTimes(1)
  })

  it("creates a new working copy when only outdated copies exist", async () => {
    const outdatedId = "outdated-copy-id"
    const setup = makeSupabase({
      active: activeImage,
      copies: [
        {
          id: outdatedId,
          storage_bucket: "project_images",
          storage_path: "path/to/outdated.jpg",
          width_px: 1000,
          height_px: 800,
          source_image_id: "old-active-id",
          name: "old.jpg (filter working)",
          updated_at: "2026-01-01T00:00:00Z",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
    })
    mockSupabase = setup.supabase

    const result = await getOrCreateFilterWorkingCopy({ supabase: mockSupabase, projectId })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.sourceImageId).toBe(activeImageId)
    expect(setup.removedIds).toEqual([[outdatedId]])
    expect(setup.insertedRows).toHaveLength(1)
    expect(copyImageTransform).toHaveBeenCalledTimes(1)
  })

  it("returns not found when no active image exists", async () => {
    const setup = makeSupabase({ active: null, copies: [] })
    mockSupabase = setup.supabase

    const result = await getOrCreateFilterWorkingCopy({ supabase: mockSupabase, projectId })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("active_lookup")
      expect(result.reason).toBe("Active image not found")
    }
  })
})
