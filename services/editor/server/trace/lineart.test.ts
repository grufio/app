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
    // Source-lookup terminal returns no data — every test in this
    // file either fails validation before the lookup or expects a
    // `source_lookup` failure.
    mockSupabase = makeMockSupabase({
      tables: { project_images: { select: { data: null, error: null } } },
    })
  })

  it("rejects line_thickness > 10", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { line_thickness: 11, blur_amount: 3, smoothness: 0.6, num_colors: 8, color_mode: "color" as const },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects line_thickness < 1", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { line_thickness: 0, blur_amount: 3, smoothness: 0.6, num_colors: 8, color_mode: "color" as const },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects blur_amount > 20", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { line_thickness: 2, blur_amount: 21, smoothness: 0.6, num_colors: 8, color_mode: "color" as const },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects smoothness > 1", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { line_thickness: 2, blur_amount: 3, smoothness: 1.5, num_colors: 8, color_mode: "color" as const },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects num_colors < 2", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { line_thickness: 2, blur_amount: 3, smoothness: 0.6, num_colors: 1, color_mode: "color" as const },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("accepts boundary values and continues to source lookup", async () => {
    const result = await lineArtImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { line_thickness: 1, blur_amount: 0, smoothness: 0, num_colors: 2, color_mode: "color" as const },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})
