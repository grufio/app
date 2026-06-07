import { describe, expect, it } from "vitest"

import { circulateSchema } from "./circulate"
import { lineartSchema } from "./lineart"
import { pixelateSchema } from "./pixelate"
import { TRACE_REGISTRY } from "./registry"

describe("TRACE_REGISTRY UI hints", () => {
  it("each ui-hint field has a matching schema field", () => {
    for (const trace of Object.values(TRACE_REGISTRY)) {
      if (!("ui" in trace) || !trace.ui) continue
      for (const fieldName of Object.keys(trace.ui)) {
        const ok = trace.schema.safeParse({ [fieldName]: undefined }).success ||
          trace.schema.safeParse({}).success
        expect(ok, `${trace.id}.${fieldName}`).toBe(true)
      }
    }
  })

  it("each ui-hint accepts the schema's default value", () => {
    for (const trace of Object.values(TRACE_REGISTRY)) {
      if (!("ui" in trace) || !trace.ui) continue
      const defaults = trace.schema.parse({}) as Record<string, unknown>
      for (const [fieldName, hint] of Object.entries(trace.ui)) {
        const v = defaults[fieldName]
        if (typeof v !== "number") continue
        const min = (hint as { min?: number }).min
        const max = (hint as { max?: number }).max
        if (min != null) expect(v, `${trace.id}.${fieldName} default below ui.min`).toBeGreaterThanOrEqual(min)
        if (max != null) expect(v, `${trace.id}.${fieldName} default above ui.max`).toBeLessThanOrEqual(max)
      }
    }
  })

  it("each ui-hint min/max value is accepted by the schema (per-field bounds only)", () => {
    const isPerFieldBoundIssue = (
      issues: Array<{ path: ReadonlyArray<PropertyKey>; code?: string }>,
      fieldName: string,
    ) => issues.some((i) => i.path[0] === fieldName && i.code !== "custom")
    for (const trace of Object.values(TRACE_REGISTRY)) {
      if (!("ui" in trace) || !trace.ui) continue
      for (const [fieldName, hint] of Object.entries(trace.ui)) {
        const min = (hint as { min?: number }).min
        const max = (hint as { max?: number }).max
        if (min != null) {
          const r = trace.schema.safeParse({ [fieldName]: min })
          if (!r.success) {
            expect(
              isPerFieldBoundIssue(r.error.issues, fieldName),
              `${trace.id}.${fieldName}.min=${min} fails per-field bound`,
            ).toBe(false)
          }
        }
        if (max != null) {
          const r = trace.schema.safeParse({ [fieldName]: max })
          if (!r.success) {
            expect(
              isPerFieldBoundIssue(r.error.issues, fieldName),
              `${trace.id}.${fieldName}.max=${max} fails per-field bound`,
            ).toBe(false)
          }
        }
      }
    }
  })
})

describe("TRACE_REGISTRY UI label coverage", () => {
  it("each ui-hint has a non-empty label", () => {
    for (const [traceId, trace] of Object.entries(TRACE_REGISTRY)) {
      if (!("ui" in trace) || !trace.ui) continue
      for (const [fieldName, hint] of Object.entries(trace.ui)) {
        const label = (hint as { label?: string }).label
        expect(typeof label, `${traceId}.${fieldName}.label is missing`).toBe("string")
        expect((label ?? "").trim().length, `${traceId}.${fieldName}.label is empty`).toBeGreaterThan(0)
      }
    }
  })
})

describe("TRACE_REGISTRY", () => {
  it("exposes pixelate", () => {
    expect(TRACE_REGISTRY.pixelate.id).toBe("pixelate")
    expect(TRACE_REGISTRY.pixelate.label).toBe("Pixelate")
    expect(TRACE_REGISTRY.pixelate.schema).toBe(pixelateSchema)
  })

  it("exposes circulate", () => {
    expect(TRACE_REGISTRY.circulate.id).toBe("circulate")
    expect(TRACE_REGISTRY.circulate.label).toBe("Circulate")
    expect(TRACE_REGISTRY.circulate.schema).toBe(circulateSchema)
  })

  it("exposes lineart", () => {
    expect(TRACE_REGISTRY.lineart.id).toBe("lineart")
    expect(TRACE_REGISTRY.lineart.label).toBe("Line Art")
    expect(TRACE_REGISTRY.lineart.schema).toBe(lineartSchema)
  })
})

describe("pixelateSchema", () => {
  // Default-shape baseline — every parse-with-empty-input test mirrors this.
  // texture_* defaults are the off-by-default texture filter, see pixelate.ts.
  const PIXELATE_DEFAULTS = {
    supercell_width_mm: 6,
    supercell_height_mm: 6,
    color_mode: "color",
    num_colors: 16,
    pre_snap_chroma_scale: 1.0,
    texture_enabled: false,
    texture_strength: 0.5,
    // Dither defaults (PR-G post-flip): Knoll-Yliluoma at 4-candidate
    // pattern. See `circulate.test.ts` for the rationale.
    dither_mode: "knoll_yliluoma",
    dither_pattern_size: 4,
    // Distance-metric default (PR-H): OKLab — see `circulate.test.ts`.
    distance_metric: "oklab",
    // Palette-cap default (PR-I): top_n — see `circulate.test.ts`.
    palette_restriction: "top_n",
  } as const

  it("applies defaults for all fields", () => {
    expect(pixelateSchema.parse({})).toEqual(PIXELATE_DEFAULTS)
  })

  it("rejects supercell_width_mm below the minimum", () => {
    expect(pixelateSchema.safeParse({ supercell_width_mm: 3 }).success).toBe(false)
    expect(pixelateSchema.safeParse({ supercell_width_mm: 0 }).success).toBe(false)
  })

  it("rejects supercell_height_mm below the minimum", () => {
    expect(pixelateSchema.safeParse({ supercell_height_mm: 3 }).success).toBe(false)
    expect(pixelateSchema.safeParse({ supercell_height_mm: 0 }).success).toBe(false)
  })

  it("accepts independent width and height", () => {
    expect(
      pixelateSchema.parse({ supercell_width_mm: 6, supercell_height_mm: 4 }),
    ).toEqual({ ...PIXELATE_DEFAULTS, supercell_height_mm: 4 })
  })

  it("accepts the b/w palette mode and a custom num_colors", () => {
    expect(pixelateSchema.parse({ color_mode: "bw", num_colors: 4 })).toEqual({
      ...PIXELATE_DEFAULTS,
      color_mode: "bw",
      num_colors: 4,
    })
  })

  it("rejects unknown color_mode / out-of-range num_colors values", () => {
    expect(pixelateSchema.safeParse({ color_mode: "grayscale" }).success).toBe(false)
    expect(pixelateSchema.safeParse({ num_colors: 1 }).success).toBe(false)
    expect(pixelateSchema.safeParse({ num_colors: 129 }).success).toBe(false)
  })

  it("accepts num_colors up to the raised cap of 128", () => {
    expect(pixelateSchema.parse({ num_colors: 128 })).toMatchObject({ num_colors: 128 })
    expect(pixelateSchema.parse({ num_colors: 64 })).toMatchObject({ num_colors: 64 })
  })

  it("accepts and clamps pre_snap_chroma_scale to [1.0, 1.5]", () => {
    expect(pixelateSchema.parse({})).toMatchObject({ pre_snap_chroma_scale: 1.0 })
    expect(pixelateSchema.parse({ pre_snap_chroma_scale: 1.0 })).toMatchObject({
      pre_snap_chroma_scale: 1.0,
    })
    expect(pixelateSchema.parse({ pre_snap_chroma_scale: 1.5 })).toMatchObject({
      pre_snap_chroma_scale: 1.5,
    })
    expect(pixelateSchema.safeParse({ pre_snap_chroma_scale: 0.9 }).success).toBe(false)
    expect(pixelateSchema.safeParse({ pre_snap_chroma_scale: 1.51 }).success).toBe(false)
  })

  it("accepts the texture toggle + each discrete strength level", () => {
    for (const s of [0.25, 0.5, 0.75, 1]) {
      expect(
        pixelateSchema.parse({ texture_enabled: true, texture_strength: s }),
      ).toMatchObject({ texture_enabled: true, texture_strength: s })
    }
  })

  it("rejects texture strengths outside the [0.25, 1] dropdown range", () => {
    expect(pixelateSchema.safeParse({ texture_strength: 0 }).success).toBe(false)
    expect(pixelateSchema.safeParse({ texture_strength: 1.25 }).success).toBe(false)
  })

  it("ignores legacy params from old wizard payloads (incl. dropped color_space)", () => {
    // Old persisted trace rows may carry dropped/renamed fields — notably
    // `color_space`, removed in favour of the `num_colors` cap. Zod's
    // default `strip` mode passes them through silently so historical
    // request payloads parse without explicit migration.
    expect(
      pixelateSchema.parse({
        supercell_width_mm: 5,
        supercell_height_mm: 5,
        color_space: "rgb", // dropped — must be stripped, not rejected
        supercell_mm: 8, // legacy single-axis field
        primary_count: 99,
        multiple_axis: "horizontal",
        stroke_width: 2,
        show_colors: false,
      }),
    ).toEqual({ ...PIXELATE_DEFAULTS, supercell_width_mm: 5, supercell_height_mm: 5 })
  })
})

describe("lineartSchema", () => {
  it("applies defaults matching frontend + Python", () => {
    expect(lineartSchema.parse({})).toEqual({
      line_thickness: 1,
      blur_amount: 3,
      smoothness: 0.6,
      num_colors: 8,
      color_mode: "color",
    })
  })

  it("coerces numeric strings", () => {
    const out = lineartSchema.parse({
      line_thickness: "3",
      blur_amount: "5",
      smoothness: "0.4",
      num_colors: "12",
    })
    expect(out.line_thickness).toBe(3)
    expect(out.blur_amount).toBe(5)
    expect(out.smoothness).toBeCloseTo(0.4)
    expect(out.num_colors).toBe(12)
  })

  it("rejects line_thickness out of [0.1, 10]", () => {
    expect(lineartSchema.safeParse({ line_thickness: 0 }).success).toBe(false)
    expect(lineartSchema.safeParse({ line_thickness: 0.05 }).success).toBe(false)
    expect(lineartSchema.safeParse({ line_thickness: 11 }).success).toBe(false)
  })

  it("accepts fractional line_thickness down to 0.1", () => {
    expect(lineartSchema.safeParse({ line_thickness: 0.1 }).success).toBe(true)
    expect(lineartSchema.parse({ line_thickness: 0.5 }).line_thickness).toBe(0.5)
  })

  it("rejects blur_amount out of [0, 20]", () => {
    expect(lineartSchema.safeParse({ blur_amount: -1 }).success).toBe(false)
    expect(lineartSchema.safeParse({ blur_amount: 21 }).success).toBe(false)
  })

  it("rejects smoothness out of [0, 1]", () => {
    expect(lineartSchema.safeParse({ smoothness: -0.01 }).success).toBe(false)
    expect(lineartSchema.safeParse({ smoothness: 1.01 }).success).toBe(false)
  })

  it("accepts smoothness at boundaries 0 and 1", () => {
    expect(lineartSchema.safeParse({ smoothness: 0 }).success).toBe(true)
    expect(lineartSchema.safeParse({ smoothness: 1 }).success).toBe(true)
  })

  it("rejects num_colors out of [2, 256]", () => {
    expect(lineartSchema.safeParse({ num_colors: 1 }).success).toBe(false)
    expect(lineartSchema.safeParse({ num_colors: 257 }).success).toBe(false)
  })
})
