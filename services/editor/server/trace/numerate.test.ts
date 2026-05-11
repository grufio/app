import { beforeEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"
import { numerateImageAndActivate } from "./numerate"

/**
 * Source-image fixture used when production code reaches the lookup
 * stage. Storage `download` is rigged to fail so we never hit the
 * Python service in unit tests — these are validation/lookup contract
 * tests, not full pipelines.
 */
function buildMockSupabase(opts: { source?: Record<string, unknown> | null } = {}) {
  return makeMockSupabase({
    tables: {
      project_images: {
        select: { data: opts.source ?? null, error: null },
      },
    },
    storage: {
      project_images: {
        download: { data: null, error: { message: "download failed" } },
      },
    },
  })
}

describe("numerateImageAndActivate validation contract", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  beforeEach(() => {
    // Source-lookup terminal returns no data — every test in this file
    // either fails validation before the lookup (so the mock is never
    // called) or expects a `source_lookup` failure.
    mockSupabase = makeMockSupabase({
      tables: { project_images: { select: { data: null, error: null } } },
    })
  })

  it("rejects superpixelWidth < 1", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 0, superpixel_height: 10, stroke_width: 2, show_colors: true, num_colors: 16 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Invalid numerate params")
    }
  })

  it("rejects superpixelHeight < 1", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 10, superpixel_height: 0, stroke_width: 2, show_colors: false, num_colors: 16 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects strokeWidth < 1", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 10, superpixel_height: 10, stroke_width: 0, show_colors: true, num_colors: 16 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects strokeWidth > 20", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 10, superpixel_height: 10, stroke_width: 21, show_colors: true, num_colors: 16 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects NaN superpixelWidth (toInt returns null)", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: NaN, superpixel_height: 10, stroke_width: 2, show_colors: true, num_colors: 16 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("accepts boundary values and continues to source lookup", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 1, superpixel_height: 1, stroke_width: 20, show_colors: false, num_colors: 16 },
    })
    // Source lookup returns null → 404 source_lookup. The validation passed.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})

describe("numerateImageAndActivate lookup + bounds contract", () => {
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  it("returns lock_conflict when source image is locked", async () => {
    const lockedSupabase = buildMockSupabase({
      source: {
        id: sourceImageId,
        name: "test.jpg",
        storage_bucket: "project_images",
        storage_path: "path/to/test.jpg",
        format: "jpeg",
        width_px: 1000,
        height_px: 800,
        is_locked: true,
      },
    })

    const result = await numerateImageAndActivate({
      supabase: lockedSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 10, superpixel_height: 10, stroke_width: 2, show_colors: true, num_colors: 16 },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("lock_conflict")
      expect(result.reason).toBe("Source image is locked")
    }
  })

  it("does not blow up when superpixel size exceeds source dimensions", async () => {
    // Mirrors the pixelate "size exceeds source" smoke test: production
    // code clamps the grid to 1×1 via `Math.max(1, …)`, so the in-line
    // "Superpixel size too large" guard is effectively dead code (same
    // pattern in pixelate.ts). The contract we *can* test from here is
    // that an oversized superpixel doesn't crash — it falls through to
    // the next stage (source_download in the fixture).
    const tinySupabase = buildMockSupabase({
      source: {
        id: sourceImageId,
        name: "tiny.png",
        storage_bucket: "project_images",
        storage_path: "path/to/tiny.png",
        format: "png",
        width_px: 5,
        height_px: 5,
        is_locked: false,
      },
    })

    const result = await numerateImageAndActivate({
      supabase: tinySupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 100, superpixel_height: 100, stroke_width: 2, show_colors: true, num_colors: 16 },
    })

    expect(result.ok).toBe(false)
  })

  it("returns source_download when storage download fails", async () => {
    // Source row exists, but `download` is rigged to fail in the fixture
    // — so production code reaches the download stage and surfaces a
    // source_download failure (without ever calling the Python service).
    const supabase = buildMockSupabase({
      source: {
        id: sourceImageId,
        name: "ok.png",
        storage_bucket: "project_images",
        storage_path: "path/to/ok.png",
        format: "png",
        width_px: 100,
        height_px: 100,
        is_locked: false,
      },
    })

    const result = await numerateImageAndActivate({
      supabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 10, superpixel_height: 10, stroke_width: 2, show_colors: true, num_colors: 16 },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("source_download")
      expect(result.reason).toBe("Failed to download source image")
    }
  })
})
