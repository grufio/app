import { describe, expect, it } from "vitest"

import { circulateSchema, circulateTrace, MIN_ELLIPSE_MM } from "./circulate"

const DEFAULTS = {
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
  // Texture defaults: off + mid-strength preserved. Server treats this as a
  // no-op (the `texture_enabled` gate is false), so old persisted rows that
  // never carried these fields parse identically to a fresh form.
  texture_enabled: false,
  texture_strength: 0.5,
  // Dither defaults (PR-G post-flip): Knoll-Yliluoma at 4-candidate
  // pattern. Persisted rows from BEFORE PR-F that lack these fields
  // now parse to the dithered default — re-applying them produces
  // KY-dithered output, which is by design (PR-G's smoke-validated
  // default). To preserve the legacy snap behaviour on a specific
  // row, the user can explicitly set `dither_mode = "none"`.
  dither_mode: "knoll_yliluoma",
  dither_pattern_size: 4,
} as const

describe("circulateSchema", () => {
  it("applies defaults for all fields", () => {
    expect(circulateSchema.parse({})).toEqual(DEFAULTS)
  })

  it("rejects outer ellipse axes below the minimum", () => {
    expect(circulateSchema.safeParse({ outer_width_mm: MIN_ELLIPSE_MM - 0.5 }).success).toBe(false)
    expect(circulateSchema.safeParse({ outer_height_mm: 0 }).success).toBe(false)
  })

  it("rejects inner ellipse axes below the minimum", () => {
    expect(circulateSchema.safeParse({ inner_width_mm: 0 }).success).toBe(false)
    expect(circulateSchema.safeParse({ inner_height_mm: -1 }).success).toBe(false)
  })

  it("accepts the inner-ellipse toggle and independent inner sizes", () => {
    expect(
      circulateSchema.parse({ inner_enabled: true, inner_width_mm: 4, inner_height_mm: 2 }),
    ).toEqual({ ...DEFAULTS, inner_enabled: true, inner_width_mm: 4, inner_height_mm: 2 })
  })

  it("rejects negative spacing on any axis", () => {
    expect(circulateSchema.safeParse({ spacing_left_mm: -1 }).success).toBe(false)
    expect(circulateSchema.safeParse({ spacing_right_mm: -0.1 }).success).toBe(false)
    expect(circulateSchema.safeParse({ spacing_top_mm: -5 }).success).toBe(false)
    expect(circulateSchema.safeParse({ spacing_bottom_mm: -2 }).success).toBe(false)
  })

  it("accepts zero spacing (touching ellipses) and positive spacing", () => {
    expect(circulateSchema.parse({ spacing_left_mm: 0, spacing_right_mm: 2 })).toEqual({
      ...DEFAULTS,
      spacing_left_mm: 0,
      spacing_right_mm: 2,
    })
  })

  it("rejects a negative contour width but allows 0 (no contour)", () => {
    expect(circulateSchema.safeParse({ contour_width_mm: -0.5 }).success).toBe(false)
    expect(circulateSchema.parse({ contour_width_mm: 0 }).contour_width_mm).toBe(0)
  })

  it("accepts the known inner colour filters and rejects unknown ones", () => {
    expect(circulateSchema.parse({ inner_filter: "complement" }).inner_filter).toBe("complement")
    expect(circulateSchema.parse({ inner_filter: "lighter" }).inner_filter).toBe("lighter")
    expect(circulateSchema.parse({ inner_filter: "none" }).inner_filter).toBe("none")
    expect(circulateSchema.safeParse({ inner_filter: "sepia" }).success).toBe(false)
  })

  it("accepts the b/w palette mode and a custom num_colors", () => {
    expect(circulateSchema.parse({ color_mode: "bw", num_colors: 8 })).toEqual({
      ...DEFAULTS,
      color_mode: "bw",
      num_colors: 8,
    })
  })

  it("rejects unknown color_mode / out-of-range num_colors values", () => {
    expect(circulateSchema.safeParse({ color_mode: "grayscale" }).success).toBe(false)
    expect(circulateSchema.safeParse({ num_colors: 1 }).success).toBe(false)
    expect(circulateSchema.safeParse({ num_colors: 129 }).success).toBe(false)
  })

  it("accepts num_colors up to the raised cap of 128", () => {
    expect(circulateSchema.parse({ num_colors: 128 })).toMatchObject({ num_colors: 128 })
  })

  it("accepts and clamps pre_snap_chroma_scale to [1.0, 1.5]", () => {
    expect(circulateSchema.parse({})).toMatchObject({ pre_snap_chroma_scale: 1.0 })
    expect(circulateSchema.safeParse({ pre_snap_chroma_scale: 0.9 }).success).toBe(false)
    expect(circulateSchema.safeParse({ pre_snap_chroma_scale: 1.51 }).success).toBe(false)
  })

  it("coerces numeric strings (form inputs arrive as text)", () => {
    const out = circulateSchema.parse({
      outer_width_mm: "8",
      outer_height_mm: "5.5",
      spacing_top_mm: "1.5",
    })
    expect(out.outer_width_mm).toBe(8)
    expect(out.outer_height_mm).toBeCloseTo(5.5)
    expect(out.spacing_top_mm).toBeCloseTo(1.5)
  })

  it("strips unknown params (forward/backward tolerance)", () => {
    expect(
      circulateSchema.parse({
        outer_width_mm: 7,
        num_colors: 16, // never existed on circulate — must be stripped
        legacy_field: "x",
      }),
    ).toEqual({ ...DEFAULTS, outer_width_mm: 7 })
  })
})

describe("circulateTrace definition", () => {
  it("exposes id + label + schema (not yet registered in TRACE_REGISTRY)", () => {
    expect(circulateTrace.id).toBe("circulate")
    expect(circulateTrace.label).toBe("Circulate")
    expect(circulateTrace.schema).toBe(circulateSchema)
  })
})
