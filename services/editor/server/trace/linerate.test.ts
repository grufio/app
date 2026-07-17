import { beforeEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"
import type { LinerateParams } from "@/lib/editor/trace/linerate"
import { linerateImageAndActivate } from "./linerate"

// Mirrors circulate.test.ts: a validation-contract test. The staging→sign→
// call(image_url)→cleanup storage flow needs a real source blob + sharp +
// filter-service mock (not in this repo's test style); its correctness is
// covered by typecheck + the filter-service byte-identity test
// (test_validation.py::test_linerate_image_url_is_byte_identical_to_image_base64).
const validParams: LinerateParams = {
  line_thickness: 1,
  flatten: 0.25,
  detail: 0.75,
  smoothness: 0.6,
  num_colors: 28,
  palette_restriction: "top_n",
  min_paintable_mm: 4,
  color_mode: "color",
  resolution: "medium",
}

describe("linerateImageAndActivate validation contract", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  beforeEach(() => {
    // Source-lookup returns null → 404 source_lookup for valid params;
    // validation failures short-circuit before this.
    mockSupabase = makeMockSupabase({
      tables: { project_images: { select: { data: null, error: null } } },
    })
  })

  it("rejects out-of-range line_thickness", async () => {
    const result = await linerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, line_thickness: 0 },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects an unknown color_mode", async () => {
    const result = await linerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: { ...validParams, color_mode: "grayscale" as unknown as LinerateParams["color_mode"] },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("continues past validation when params are valid (fails at source lookup)", async () => {
    const result = await linerateImageAndActivate({
      supabase: mockSupabase,
      projectId,
      sourceImageId,
      params: validParams,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})
