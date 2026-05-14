import { beforeEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"
import type { NumerateParams } from "@/lib/editor/trace/numerate"
import { numerateImageAndActivate } from "./numerate"

/** Valid numerate params — the base square 6mm supercell, 40 cells on
 * the primary axis. Tests override one field at a time. */
const validParams: NumerateParams = {
  supercell_mm: 6,
  multiple_axis: "none",
  multiple: 1,
  primary_count: 40,
  stroke_width: 2,
  show_colors: true,
  num_colors: 16,
}

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

  it("rejects supercell_mm below the minimum", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, supercell_mm: 3 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Invalid numerate params")
    }
  })

  it("rejects multiple < 1", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, multiple: 0 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects primary_count < 1", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, primary_count: 0 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects stroke_width out of range", async () => {
    const low = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, stroke_width: 0 },
    })
    expect(low.ok).toBe(false)
    const high = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, stroke_width: 21 },
    })
    expect(high.ok).toBe(false)
  })

  it("rejects NaN supercell_mm (fails the schema min check)", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, supercell_mm: NaN },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("accepts valid params and continues to source lookup", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: validParams,
    })
    // Source lookup returns null → 404 source_lookup. Validation passed.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})

describe("numerateImageAndActivate lookup + grid contract", () => {
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
      params: validParams,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("lock_conflict")
      expect(result.reason).toBe("Source image is locked")
    }
  })

  it("rejects a grid where no whole cell fits", async () => {
    // primary_count 1 on a 1000x800 landscape image → a 1000px-wide
    // square cell, taller than the 800px image → cellsY = 0 → the
    // resolved grid is invalid, caught before the download stage.
    const supabase = buildMockSupabase({
      source: {
        id: sourceImageId,
        name: "small.png",
        storage_bucket: "project_images",
        storage_path: "path/to/small.png",
        format: "png",
        width_px: 1000,
        height_px: 800,
        is_locked: false,
      },
    })

    const result = await numerateImageAndActivate({
      supabase,
      projectId,
      sourceImageId,
      params: { ...validParams, primary_count: 1 },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Supercell too large for the image — no whole cell fits")
    }
  })

  it("returns source_download when storage download fails", async () => {
    // Source row exists with a valid grid, but `download` is rigged to
    // fail — production code reaches the download stage and surfaces a
    // source_download failure without ever calling the Python service.
    const supabase = buildMockSupabase({
      source: {
        id: sourceImageId,
        name: "ok.png",
        storage_bucket: "project_images",
        storage_path: "path/to/ok.png",
        format: "png",
        width_px: 4000,
        height_px: 3000,
        is_locked: false,
      },
    })

    const result = await numerateImageAndActivate({
      supabase,
      projectId,
      sourceImageId,
      params: validParams,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("source_download")
      expect(result.reason).toBe("Failed to download source image")
    }
  })
})
