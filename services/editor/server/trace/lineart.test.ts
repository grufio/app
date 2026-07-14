import { beforeEach, describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

import { makeMockSupabase } from "@/lib/supabase/__mocks__/make-mock-supabase"
import type { Database } from "@/lib/supabase/database.types"
import type { LineartParams } from "@/lib/editor/trace/lineart"
import { lineArtImageAndActivate } from "./lineart"

// Base valid params; each test overrides the one field under test.
const base: LineartParams = {
  line_thickness: 2,
  blur_amount: 3,
  smoothness: 0.6,
  num_colors: 8,
  palette_restriction: "top_n",
  color_mode: "color",
  min_paintable_mm: 4,
}

describe("lineArtImageAndActivate validation contract", () => {
  let mockSupabase: SupabaseClient<Database>
  const projectId = "test-project-id"
  const sourceImageId = "source-image-id"

  beforeEach(() => {
    // Source-lookup terminal returns no data — every test in this file either
    // fails validation before the lookup or expects a `source_lookup` failure.
    mockSupabase = makeMockSupabase({
      tables: { project_images: { select: { data: null, error: null } } },
    })
  })

  const run = (params: LineartParams) =>
    lineArtImageAndActivate({ supabase: mockSupabase, projectId, sourceImageId, params })

  it("rejects line_thickness > 10", async () => {
    const result = await run({ ...base, line_thickness: 11 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects line_thickness < 0.1", async () => {
    const result = await run({ ...base, line_thickness: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects blur_amount > 20", async () => {
    const result = await run({ ...base, blur_amount: 21 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects smoothness > 1", async () => {
    const result = await run({ ...base, smoothness: 1.5 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects num_colors < 2", async () => {
    const result = await run({ ...base, num_colors: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects num_colors > 560 (above the full-palette budget)", async () => {
    const result = await run({ ...base, num_colors: 561 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("rejects an invalid palette_restriction", async () => {
    // deliberately bogus value → zod enum rejects before the source lookup
    const result = await run({ ...base, palette_restriction: "bogus" as never })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("validation")
  })

  it("accepts boundary values (num_colors 560, pam) and continues to source lookup", async () => {
    const result = await run({ ...base, line_thickness: 1, blur_amount: 0, smoothness: 0, num_colors: 560, palette_restriction: "pam" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.stage).toBe("source_lookup")
  })
})
