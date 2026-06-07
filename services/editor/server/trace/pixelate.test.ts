import { beforeEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"
import type { PixelateParams } from "@/lib/editor/trace/pixelate"
import { pixelateImageAndActivate } from "./pixelate"

const validParams: PixelateParams = {
  supercell_width_mm: 6,
  supercell_height_mm: 6,
  color_mode: "color",
  num_colors: 16,
  pre_snap_chroma_scale: 1.0,
  texture_enabled: false,
  texture_strength: 0.5,
  dither_mode: "knoll_yliluoma",
  dither_pattern_size: 4,
}

describe("pixelateImageAndActivate validation contract", () => {
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

  it("rejects supercell_width_mm below the minimum", async () => {
    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, supercell_width_mm: 3 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toMatch(/^Invalid pixelate params:/)
    }
  })

  it("rejects supercell_height_mm below the minimum", async () => {
    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, supercell_height_mm: 3 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects NaN supercell dimensions", async () => {
    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, supercell_width_mm: NaN },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects an unknown color_mode", async () => {
    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, color_mode: "grayscale" as unknown as PixelateParams["color_mode"] },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("ignores legacy params from old wizard payloads (incl. dropped num_colors)", async () => {
    // Old persisted trace rows may carry dropped/renamed fields — notably
    // num_colors (removed for the palette map), plus primary_count /
    // stroke_width / show_colors / multiple_axis / multiple / supercell_mm
    // (single-axis). Zod strip mode drops them silently so the new
    // validation doesn't reject historical requests. Validation passes;
    // failure is at source_lookup.
    const result = await pixelateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        supercell_width_mm: 6,
        supercell_height_mm: 6,
        num_colors: 16,
        supercell_mm: 8,
        primary_count: 40,
        multiple_axis: "none",
        multiple: 1,
        stroke_width: 2,
        show_colors: true,
      } as unknown as PixelateParams,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })

  it("continues past validation when params are valid", async () => {
    const result = await pixelateImageAndActivate({
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

describe("pixelateImageAndActivate lookup contract", () => {
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

    const result = await pixelateImageAndActivate({
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
