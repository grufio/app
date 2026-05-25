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
  hue_shift_deg: 0,
  color_mode: "color",
  color_space: "rgb",
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

  it("rejects a hue shift outside [-180, 180]", () => {
    expect(circulateSchema.safeParse({ hue_shift_deg: 181 }).success).toBe(false)
    expect(circulateSchema.safeParse({ hue_shift_deg: -181 }).success).toBe(false)
    expect(circulateSchema.parse({ hue_shift_deg: -180 }).hue_shift_deg).toBe(-180)
    expect(circulateSchema.parse({ hue_shift_deg: 180 }).hue_shift_deg).toBe(180)
  })

  it("accepts the b/w palette mode and the cmyk colour space", () => {
    expect(circulateSchema.parse({ color_mode: "bw", color_space: "cmyk" })).toEqual({
      ...DEFAULTS,
      color_mode: "bw",
      color_space: "cmyk",
    })
  })

  it("rejects unknown color_mode / color_space values", () => {
    expect(circulateSchema.safeParse({ color_mode: "grayscale" }).success).toBe(false)
    expect(circulateSchema.safeParse({ color_space: "lab" }).success).toBe(false)
  })

  it("coerces numeric strings (form inputs arrive as text)", () => {
    const out = circulateSchema.parse({
      outer_width_mm: "8",
      outer_height_mm: "5.5",
      spacing_top_mm: "1.5",
      hue_shift_deg: "30",
    })
    expect(out.outer_width_mm).toBe(8)
    expect(out.outer_height_mm).toBeCloseTo(5.5)
    expect(out.spacing_top_mm).toBeCloseTo(1.5)
    expect(out.hue_shift_deg).toBe(30)
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
