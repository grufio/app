import { beforeEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"
import { lineArtImageAndActivate } from "./lineart"

describe("lineArtImageAndActivate validation contract", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  beforeEach(() => {
    // Source-lookup terminal returns no data — every test in this file
    // either fails validation before the lookup or expects a
    // `source_lookup` failure.
    mockSupabase = makeMockSupabase({
      tables: { project_images: { select: { data: null, error: null } } },
    })
  })

  it("rejects smoothness values above 0.1", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: 50,
        threshold2: 200,
        line_thickness: 2,
        invert: true,
        blur_amount: 3,
        min_contour_area: 200,
        smoothness: 0.11,
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("validation")
      expect(result.reason).toBe("Invalid line art params")
    }
  })

  it("accepts smoothness 0.1 and continues to source lookup", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: 50,
        threshold2: 200,
        line_thickness: 2,
        invert: true,
        blur_amount: 3,
        min_contour_area: 200,
        smoothness: 0.1,
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.stage).toBe("source_lookup")
    }
  })

  it("rejects when threshold1 >= threshold2 (must be strictly less)", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: 200,
        threshold2: 200,
        line_thickness: 2,
        invert: false,
        blur_amount: 3,
        min_contour_area: 200,
        smoothness: 0.005,
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects negative threshold values", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: -1,
        threshold2: 100,
        line_thickness: 2,
        invert: false,
        blur_amount: 3,
        min_contour_area: 200,
        smoothness: 0.005,
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects lineThickness > 10", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: 50,
        threshold2: 200,
        line_thickness: 11,
        invert: false,
        blur_amount: 3,
        min_contour_area: 200,
        smoothness: 0.005,
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects blurAmount > 20", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: 50,
        threshold2: 200,
        line_thickness: 2,
        invert: false,
        blur_amount: 21,
        min_contour_area: 200,
        smoothness: 0.005,
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects negative minContourArea", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: {
        threshold1: 50,
        threshold2: 200,
        line_thickness: 2,
        invert: false,
        blur_amount: 3,
        min_contour_area: -1,
        smoothness: 0.005,
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })
})
