/**
 * Tests for filter working copy creation and management.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import { getFilterPanelData, getOrCreateFilterWorkingCopy } from "./filter-working-copy"
import { copyImageTransform } from "./copy-image-transform"

const { getEditorTargetImageRowMock } = vi.hoisted(() => ({
  getEditorTargetImageRowMock: vi.fn(),
}))

vi.mock("./copy-image-transform", () => ({
  copyImageTransform: vi.fn(async () => ({ ok: true as const })),
}))

vi.mock("@/lib/supabase/project-images", () => ({
  // Mock returns `{row, error}` style; adapt it to the multi-row shape the impl now uses.
  resolveEditorTargetImageRows: async (...args: unknown[]) => {
    const r = await getEditorTargetImageRowMock(...args)
    if (r?.error) return { target: null, preferredWorking: null, error: r.error }
    return { target: r?.row ?? null, preferredWorking: r?.row ?? null, error: null }
  },
}))

/**
 * Storage handlers used across both describe blocks. Returns canned
 * data for download / upload / createSignedUrl / remove. The factory
 * doesn't expose its own storage vi.fn for external configuration, so
 * we override `supabase.storage` after construction.
 */
function makeStorage() {
  return {
    from: vi.fn(() => ({
      download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })),
      upload: vi.fn(async () => ({ error: null })),
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed-url.test/img.jpg" }, error: null })),
      remove: vi.fn(async () => ({ error: null })),
    })),
  }
}

describe("getOrCreateFilterWorkingCopy", () => {
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

  function makeSupabase(args: { copies?: Array<Record<string, unknown>> }) {
    const removedIds: string[][] = []
    const insertedRows: Array<Record<string, unknown>> = []

    const supabase = makeMockSupabase({
      tables: {
        project_image_filters: {
          select: { data: [], error: null },
          delete: { data: null, error: null },
        },
        project_images: {
          // Two terminal styles on the SAME .select() callsite:
          //   - `.limit()` resolves with the working-copy candidates
          //   - `.in(...).is(...)` resolves with [] for the storage-cleanup
          //     short-circuit before the soft-delete update
          // The factory's function-form spec lets us inspect `ops` so each
          // terminal returns its own shape.
          select: ({ ops }) => {
            if (ops.includes("in")) return { data: [], error: null }
            return { data: args.copies ?? [], error: null }
          },
          // soft-delete tombstone update: `.update(...).in("id", ids)`. The
          // `in` call is a chain method, so its args land in `chain.args`.
          update: {
            data: null,
            error: null,
            onCall: ({ args: chainArgs }) => {
              for (const callArgs of chainArgs as unknown[][]) {
                if (callArgs.length === 2 && callArgs[0] === "id" && Array.isArray(callArgs[1])) {
                  removedIds.push(callArgs[1] as string[])
                }
              }
            },
          },
          insert: {
            data: null,
            error: null,
            onCall: ({ opArgs }) => {
              insertedRows.push(opArgs[0] as Record<string, unknown>)
            },
          },
        },
      },
    })

    supabase.storage = makeStorage() as unknown as typeof supabase.storage

    return { supabase, removedIds, insertedRows }
  }

  beforeEach(() => {
    vi.mocked(copyImageTransform).mockClear()
    getEditorTargetImageRowMock.mockReset()
    getEditorTargetImageRowMock.mockResolvedValue({ row: activeImage, error: null })
  })

  it("returns existing reusable copy and cleans duplicates", async () => {
    const reusableId = "working-copy-id"
    const duplicateId = "duplicate-working-copy-id"
    const setup = makeSupabase({
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

    const result = await getOrCreateFilterWorkingCopy({ supabase: setup.supabase, projectId })

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

    const result = await getOrCreateFilterWorkingCopy({ supabase: setup.supabase, projectId })

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
    const setup = makeSupabase({ copies: [] })

    const result = await getOrCreateFilterWorkingCopy({ supabase: setup.supabase, projectId })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("transform_sync")
      expect(result.reason).toContain("Source image transform is missing")
    }
  })

  it("returns not found when no active image exists", async () => {
    getEditorTargetImageRowMock.mockResolvedValueOnce({ row: null, error: null })
    const setup = makeSupabase({ copies: [] })

    const result = await getOrCreateFilterWorkingCopy({ supabase: setup.supabase, projectId })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("no_active_image")
      expect(result.reason).toBe("Active image not found")
    }
  })
})

describe("getFilterPanelData", () => {
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

  beforeEach(() => {
    getEditorTargetImageRowMock.mockReset()
    getEditorTargetImageRowMock.mockResolvedValue({ row: activeImage, error: null })
  })

  it("prefers canonical project_image_filters order over name heuristics", async () => {
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

    const supabase = makeMockSupabase({
      tables: {
        project_images: {
          // Two distinct selects:
          //   - working-copy lookup: `.eq().like().is().order().limit()` -> [workingCopy]
          //   - output-image batch: `.eq().in().is().order()` -> outputImages
          // Branch on whether `.in()` participated in the chain.
          select: ({ ops }) => {
            if (ops.includes("in")) return { data: outputImages, error: null }
            return { data: [workingCopy], error: null }
          },
        },
        project_image_filters: {
          select: { data: filterRows, error: null },
        },
      },
    })
    supabase.storage = makeStorage() as unknown as typeof supabase.storage

    const result = await getFilterPanelData({ supabase, projectId: "project-1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.display.id).toBe("img-lineart")
      expect(result.display.isFilterResult).toBe(true)
      expect(result.stack.map((s) => s.id)).toEqual(["f1", "f2"])
      expect(result.stack.map((s) => s.filterType)).toEqual(["pixelate", "lineart"])
    }
  })

  it("auto-resets disconnected filter chain and returns empty stack", async () => {
    const disconnectedFilterRows = [
      {
        id: "f1",
        input_image_id: "other-image-id",
        output_image_id: "img-pixelate",
        filter_type: "pixelate",
        stack_order: 1,
      },
    ]

    let filterDeleteCalled = false
    const supabase = makeMockSupabase({
      tables: {
        project_images: {
          // First call (panel-data, working-copy lookup): chain ends in
          // .limit() -> [workingCopy]. Subsequent calls during the auto-
          // reset hit .in() / .is() to look up storage paths -> [] so
          // storage cleanup short-circuits.
          select: ({ ops }) => {
            if (ops.includes("in") || ops.includes("update")) return { data: [], error: null }
            return { data: [workingCopy], error: null }
          },
          // The reset path calls update(...) -> resolve to no error.
          update: { data: null, error: null },
        },
        project_image_filters: {
          select: { data: disconnectedFilterRows, error: null },
          delete: {
            data: null,
            error: null,
            onCall: () => {
              filterDeleteCalled = true
            },
          },
        },
      },
    })
    supabase.storage = makeStorage() as unknown as typeof supabase.storage

    const result = await getFilterPanelData({ supabase, projectId: "project-1" })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.stack).toEqual([])
      expect(result.display.id).toBe("working-copy-id")
    }
    expect(filterDeleteCalled).toBe(true)
  })
})
