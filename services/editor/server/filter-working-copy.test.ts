/**
 * Tests for filter working copy creation and management.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getFilterPanelData, getOrCreateFilterWorkingCopy } from "./filter-working-copy"
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
          eq: vi.fn(async () => ({ error: null })),
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

  it("fails explicitly when transform copy fails", async () => {
    vi.mocked(copyImageTransform).mockResolvedValueOnce({
      ok: false,
      reason: "Source image transform is missing",
    })
    const setup = makeSupabase({ active: activeImage, copies: [] })
    mockSupabase = setup.supabase

    const result = await getOrCreateFilterWorkingCopy({ supabase: mockSupabase, projectId })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("transform_sync")
      expect(result.reason).toContain("Source image transform is missing")
    }
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

describe("getFilterPanelData", () => {
  it("prefers canonical project_image_filters order over name heuristics", async () => {
    const activeImage = {
      id: "active-image-id",
      name: "master.jpg",
      storage_bucket: "project_images",
      storage_path: "projects/p/images/master",
      format: "jpeg",
      width_px: 1000,
      height_px: 800,
      file_size_bytes: 50000,
      source_image_id: null,
    }
    const workingCopy = {
      id: "working-copy-id",
      storage_bucket: "project_images",
      storage_path: "projects/p/images/working",
      width_px: 1000,
      height_px: 800,
      source_image_id: "active-image-id",
      name: "master.jpg (filter working)",
      updated_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    }
    const filterRows = [
      {
        id: "f1",
        input_image_id: "working-copy-id",
        output_image_id: "img-pixelate",
        filter_type: "pixelate",
        stack_order: 1,
      },
      {
        id: "f2",
        input_image_id: "img-pixelate",
        output_image_id: "img-lineart",
        filter_type: "lineart",
        stack_order: 2,
      },
    ]
    const outputImages = [
      {
        id: "img-pixelate",
        name: "master (pixelate)",
        storage_bucket: "project_images",
        storage_path: "projects/p/images/pixelate",
        width_px: 1000,
        height_px: 800,
        source_image_id: "working-copy-id",
      },
      {
        id: "img-lineart",
        name: "master (line art)",
        storage_bucket: "project_images",
        storage_path: "projects/p/images/lineart",
        width_px: 1000,
        height_px: 800,
        source_image_id: "img-pixelate",
      },
    ]

    let projectImagesCall = 0
    const from = vi.fn((table: string) => {
      if (table === "project_images") {
        projectImagesCall += 1
        if (projectImagesCall === 1) {
          const q: Record<string, unknown> = {}
          q.select = vi.fn(() => q)
          q.eq = vi.fn(() => q)
          q.is = vi.fn(() => q)
          q.maybeSingle = vi.fn(async () => ({ data: activeImage, error: null }))
          return q
        }
        if (projectImagesCall === 2) {
          const q: Record<string, unknown> = {}
          q.select = vi.fn(() => q)
          q.eq = vi.fn(() => q)
          q.like = vi.fn(() => q)
          q.is = vi.fn(() => q)
          q.order = vi.fn(() => q)
          q.limit = vi.fn(async () => ({ data: [workingCopy], error: null }))
          return q
        }
        const q: Record<string, unknown> = {}
        q.select = vi.fn(() => q)
        q.eq = vi.fn(() => q)
        q.in = vi.fn(() => q)
        q.is = vi.fn(() => q)
        q.order = vi.fn(async () => ({ data: outputImages, error: null }))
        return q
      }
      if (table === "project_image_filters") {
        const q: Record<string, unknown> = {}
        q.select = vi.fn(() => q)
        q.eq = vi.fn(() => q)
        q.order = vi.fn(async () => ({ data: filterRows, error: null }))
        return q
      }
      return {}
    })

    const supabase = {
      from,
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed-url.test/img.jpg" }, error: null })),
          download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })),
        })),
      },
    } as unknown as SupabaseClient<Database>

    const result = await getFilterPanelData({ supabase, projectId: "project-1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.display.id).toBe("img-lineart")
      expect(result.display.isFilterResult).toBe(true)
      expect(result.stack.map((s) => s.id)).toEqual(["f1", "f2"])
      expect(result.stack.map((s) => s.filterType)).toEqual(["pixelate", "lineart"])
    }
  })

  it("fails when stored filter rows are disconnected from working copy chain", async () => {
    const activeImage = {
      id: "active-image-id",
      name: "master.jpg",
      storage_bucket: "project_images",
      storage_path: "projects/p/images/master",
      format: "jpeg",
      width_px: 1000,
      height_px: 800,
      file_size_bytes: 50000,
      source_image_id: null,
    }
    const workingCopy = {
      id: "working-copy-id",
      storage_bucket: "project_images",
      storage_path: "projects/p/images/working",
      width_px: 1000,
      height_px: 800,
      source_image_id: "active-image-id",
      name: "master.jpg (filter working)",
      updated_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    }
    const disconnectedFilterRows = [
      {
        id: "f1",
        input_image_id: "other-image-id",
        output_image_id: "img-pixelate",
        filter_type: "pixelate",
        stack_order: 1,
      },
    ]

    let projectImagesCall = 0
    const from = vi.fn((table: string) => {
      if (table === "project_images") {
        projectImagesCall += 1
        if (projectImagesCall === 1) {
          const q: Record<string, unknown> = {}
          q.select = vi.fn(() => q)
          q.eq = vi.fn(() => q)
          q.is = vi.fn(() => q)
          q.maybeSingle = vi.fn(async () => ({ data: activeImage, error: null }))
          return q
        }
        if (projectImagesCall === 2) {
          const q: Record<string, unknown> = {}
          q.select = vi.fn(() => q)
          q.eq = vi.fn(() => q)
          q.like = vi.fn(() => q)
          q.is = vi.fn(() => q)
          q.order = vi.fn(() => q)
          q.limit = vi.fn(async () => ({ data: [workingCopy], error: null }))
          return q
        }
      }
      if (table === "project_image_filters") {
        const q: Record<string, unknown> = {}
        q.select = vi.fn(() => q)
        q.eq = vi.fn(() => q)
        q.order = vi.fn(async () => ({ data: disconnectedFilterRows, error: null }))
        return q
      }
      return {}
    })

    const supabase = {
      from,
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed-url.test/img.jpg" }, error: null })),
          download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })),
        })),
      },
    } as unknown as SupabaseClient<Database>

    const result = await getFilterPanelData({ supabase, projectId: "project-1" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("chain_invalid")
    }
  })
})
