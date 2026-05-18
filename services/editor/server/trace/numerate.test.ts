import { beforeEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"
import type { NumerateParams } from "@/lib/editor/trace/numerate"
import { numerateImageAndActivate } from "./numerate"

const validParams: NumerateParams = {
  supercell_mm: 6,
  num_colors: 16,
}

describe("numerateImageAndActivate validation contract", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  beforeEach(() => {
    // Source-lookup returns null → 404 source_lookup for tests that
    // pass validation. Validation failures short-circuit before this.
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

  it("rejects NaN supercell_mm", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, supercell_mm: NaN },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects num_colors out of range", async () => {
    const low = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, num_colors: 1 },
    })
    expect(low.ok).toBe(false)
    const high = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, num_colors: 999 },
    })
    expect(high.ok).toBe(false)
  })

  it("ignores legacy params from old wizard payloads", async () => {
    // Old persisted trace rows may carry primary_count / stroke_width /
    // show_colors / multiple_axis / multiple — Zod strip mode drops
    // them silently so the new validation doesn't reject historical
    // requests. Validation passes; failure is at source_lookup.
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        supercell_mm: 6,
        num_colors: 16,
        primary_count: 40,
        multiple_axis: "none",
        multiple: 1,
        stroke_width: 2,
        show_colors: true,
      } as unknown as NumerateParams,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })

  it("continues past validation when params are valid", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: validParams,
    })
    // Source lookup returns null → 404 source_lookup; validation passed.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})

describe("numerateImageAndActivate lookup contract", () => {
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  it("returns lock_conflict when source image is locked", async () => {
    const supabase = makeMockSupabase({
      tables: {
        project_images: {
          select: {
            data: {
              id: sourceImageId,
              name: "test.jpg",
              storage_bucket: "project_images",
              storage_path: "path/to/test.jpg",
              format: "jpeg",
              width_px: 1000,
              height_px: 800,
              is_locked: true,
            },
            error: null,
          },
        },
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
      expect(result.stage).toBe("lock_conflict")
      expect(result.reason).toBe("Source image is locked")
    }
  })
})
