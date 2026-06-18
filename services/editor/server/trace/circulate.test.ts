import { beforeEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"
import type { CirculateParams } from "@/lib/editor/trace/circulate"
import { circulateImageAndActivate } from "./circulate"

const validParams: CirculateParams = {
  outer_width_mm: 6,
  outer_height_mm: 6,
  inner_enabled: false,
  inner_width_mm: 3,
  inner_height_mm: 3,
  spacing_left_mm: 0,
  spacing_right_mm: 0,
  spacing_top_mm: 0,
  spacing_bottom_mm: 0,
  contour_width_mm: 0.2,
  inner_filter: "darker",
  color_mode: "color",
  num_colors: 16,
  pre_snap_chroma_scale: 1.0,
  dither_mode: "knoll_yliluoma",
  dither_strength: 0.5,
  distance_metric: "oklab",
  palette_restriction: "top_n",
}

describe("circulateImageAndActivate validation contract", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  beforeEach(() => {
    // Source-lookup returns null → 404 source_lookup for tests that pass
    // validation. Validation failures short-circuit before this.
    mockSupabase = makeMockSupabase({
      tables: { project_images: { select: { data: null, error: null } } },
    })
  })

  it("rejects an outer ellipse axis below the minimum", async () => {
    const result = await circulateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, outer_width_mm: 0 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toMatch(/^Invalid circulate params:/)
    }
  })

  it("rejects negative spacing", async () => {
    const result = await circulateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, spacing_left_mm: -1 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects an unknown color_mode", async () => {
    const result = await circulateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, color_mode: "grayscale" as unknown as CirculateParams["color_mode"] },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects an unknown inner colour filter", async () => {
    const result = await circulateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, inner_filter: "sepia" as unknown as CirculateParams["inner_filter"] },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("ignores legacy/unknown params (Zod strip)", async () => {
    const result = await circulateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        ...validParams,
        num_colors: 16, // never existed on circulate
        supercell_mm: 8,
      } as unknown as CirculateParams,
    })
    // Validation passes; failure is at source_lookup (null source).
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })

  it("continues past validation when params are valid", async () => {
    const result = await circulateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: validParams,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})

