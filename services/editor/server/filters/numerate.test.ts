import { beforeEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"
import { numerateImageAndActivate } from "./numerate"

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
      params: { superpixel_width: 0, superpixel_height: 10, stroke_width: 2, show_colors: true },
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
      params: { superpixel_width: 10, superpixel_height: 0, stroke_width: 2, show_colors: false },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects strokeWidth < 1", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 10, superpixel_height: 10, stroke_width: 0, show_colors: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects strokeWidth > 20", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 10, superpixel_height: 10, stroke_width: 21, show_colors: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects NaN superpixelWidth (toInt returns null)", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: NaN, superpixel_height: 10, stroke_width: 2, show_colors: true },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("accepts boundary values and continues to source lookup", async () => {
    const result = await numerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { superpixel_width: 1, superpixel_height: 1, stroke_width: 20, show_colors: false },
    })
    // Source lookup returns null → 404 source_lookup. The validation passed.
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})
