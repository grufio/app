import { describe, expect, it } from "vitest"

import { lineartSchema } from "./lineart"
import { numerateFilter, numerateSchema } from "./numerate"
import { pixelateSchema } from "./pixelate"
import { FILTER_REGISTRY } from "./registry"
import type { FilterRenderContext } from "./types"

describe("FILTER_REGISTRY UI hints", () => {
  it("each ui-hint field has a matching schema field", () => {
    for (const filter of Object.values(FILTER_REGISTRY)) {
      if (!filter.ui) continue
      for (const fieldName of Object.keys(filter.ui)) {
        const ok = filter.schema.safeParse({ [fieldName]: undefined }).success ||
          filter.schema.safeParse({}).success
        expect(ok, `${filter.id}.${fieldName}`).toBe(true)
      }
    }
  })

  it("each ui-hint accepts the schema's default value", () => {
    for (const filter of Object.values(FILTER_REGISTRY)) {
      if (!filter.ui) continue
      const defaults = filter.schema.parse({}) as Record<string, unknown>
      for (const [fieldName, hint] of Object.entries(filter.ui)) {
        const v = defaults[fieldName]
        if (typeof v !== "number") continue
        if (hint.min != null) expect(v, `${filter.id}.${fieldName} default below ui.min`).toBeGreaterThanOrEqual(hint.min)
        if (hint.max != null) expect(v, `${filter.id}.${fieldName} default above ui.max`).toBeLessThanOrEqual(hint.max)
      }
    }
  })

  it("each ui-hint min/max value is accepted by the schema (per-field bounds only)", () => {
    // Cross-field refines (e.g. lineart.threshold1 < threshold2) cannot be
    // tested here without varying the partner field — so we look for
    // numeric type/range issues only on the field-of-interest path.
    const isPerFieldBoundIssue = (
      issues: Array<{ path: ReadonlyArray<PropertyKey>; code?: string }>,
      fieldName: string,
    ) => issues.some((i) => i.path[0] === fieldName && i.code !== "custom")
    for (const filter of Object.values(FILTER_REGISTRY)) {
      if (!filter.ui) continue
      for (const [fieldName, hint] of Object.entries(filter.ui)) {
        if (hint.min != null) {
          const r = filter.schema.safeParse({ [fieldName]: hint.min })
          if (!r.success) {
            expect(
              isPerFieldBoundIssue(r.error.issues, fieldName),
              `${filter.id}.${fieldName}.min=${hint.min} fails per-field bound`,
            ).toBe(false)
          }
        }
        if (hint.max != null) {
          const r = filter.schema.safeParse({ [fieldName]: hint.max })
          if (!r.success) {
            expect(
              isPerFieldBoundIssue(r.error.issues, fieldName),
              `${filter.id}.${fieldName}.max=${hint.max} fails per-field bound`,
            ).toBe(false)
          }
        }
      }
    }
  })
})

describe("numerateFilter.transformBeforeSubmit", () => {
  // Numerate's superpixel_width / _height are not in its form — the
  // Pixelate filter earlier in the chain decides them, and the
  // transform injects them right before submit. The GenericFilterForm
  // relies on this hook to round-trip a valid NumerateParams payload.
  const ctx: FilterRenderContext = {
    imageWidth: 1024,
    imageHeight: 768,
    numerateSuperpixelWidth: 17,
    numerateSuperpixelHeight: 23,
  }

  it("injects numerate superpixel dimensions from context", () => {
    const params = numerateSchema.parse({})
    const out = numerateFilter.transformBeforeSubmit?.({ params, ctx })
    expect(out?.superpixel_width).toBe(17)
    expect(out?.superpixel_height).toBe(23)
  })

  it("preserves user-collected stroke_width and show_colors", () => {
    const params = numerateSchema.parse({ stroke_width: 7, show_colors: false })
    const out = numerateFilter.transformBeforeSubmit?.({ params, ctx })
    expect(out?.stroke_width).toBe(7)
    expect(out?.show_colors).toBe(false)
  })

  it("returns a payload the schema accepts back", () => {
    const params = numerateSchema.parse({})
    const out = numerateFilter.transformBeforeSubmit?.({ params, ctx })
    expect(numerateSchema.safeParse(out).success).toBe(true)
  })
})

describe("FILTER_REGISTRY UI label coverage", () => {
  // Form-rendered fields must carry a `label` in the registry so the
  // dialog and any future generic FilterForm read from one source.
  // Numerate's superpixel_width / _height are injected by the
  // controller from Pixelate's grid math (not surfaced in the form),
  // so they're explicitly excluded here. If a new filter introduces
  // similar injected-only fields, list them in this map.
  const FIELDS_NOT_RENDERED_IN_FORM: Partial<Record<keyof typeof FILTER_REGISTRY, ReadonlyArray<string>>> = {
    numerate: ["superpixel_width", "superpixel_height"],
  }

  it("each form-rendered ui-hint has a non-empty label", () => {
    for (const [filterId, filter] of Object.entries(FILTER_REGISTRY)) {
      if (!filter.ui) continue
      const skip = new Set(FIELDS_NOT_RENDERED_IN_FORM[filterId as keyof typeof FILTER_REGISTRY] ?? [])
      for (const [fieldName, hint] of Object.entries(filter.ui)) {
        if (skip.has(fieldName)) continue
        const label = (hint as { label?: string }).label
        expect(typeof label, `${filterId}.${fieldName}.label is missing`).toBe("string")
        expect((label ?? "").trim().length, `${filterId}.${fieldName}.label is empty`).toBeGreaterThan(0)
      }
    }
  })
})

describe("FILTER_REGISTRY", () => {
  it("exposes pixelate with id, label, and schema", () => {
    expect(FILTER_REGISTRY.pixelate.id).toBe("pixelate")
    expect(FILTER_REGISTRY.pixelate.label).toBe("Pixelate")
    expect(FILTER_REGISTRY.pixelate.schema).toBe(pixelateSchema)
  })

  it("exposes lineart with id, label, and schema", () => {
    expect(FILTER_REGISTRY.lineart.id).toBe("lineart")
    expect(FILTER_REGISTRY.lineart.label).toBe("Line Art")
    expect(FILTER_REGISTRY.lineart.schema).toBe(lineartSchema)
  })

  it("exposes numerate with id, label, and schema", () => {
    expect(FILTER_REGISTRY.numerate.id).toBe("numerate")
    expect(FILTER_REGISTRY.numerate.label).toBe("Numerate")
    expect(FILTER_REGISTRY.numerate.schema).toBe(numerateSchema)
  })
})

describe("numerateSchema", () => {
  it("applies defaults matching frontend + Python (stroke_width=2, not the prior TS-Backend 1)", () => {
    expect(numerateSchema.parse({})).toEqual({
      superpixel_width: 10,
      superpixel_height: 10,
      stroke_width: 2,
      show_colors: true,
    })
  })

  it("rejects stroke_width < 1", () => {
    expect(numerateSchema.safeParse({ stroke_width: 0 }).success).toBe(false)
  })

  it("rejects stroke_width > 20", () => {
    expect(numerateSchema.safeParse({ stroke_width: 21 }).success).toBe(false)
  })

  it("rejects superpixel_width < 1", () => {
    expect(numerateSchema.safeParse({ superpixel_width: 0 }).success).toBe(false)
  })
})

describe("lineartSchema", () => {
  it("applies defaults matching frontend + Python (not the prior TS-Backend drift)", () => {
    expect(lineartSchema.parse({})).toEqual({
      threshold1: 50,
      threshold2: 200,
      line_thickness: 2,
      blur_amount: 3,
      min_contour_area: 500,
      invert: true,
      smoothness: 0.002,
    })
  })

  it("coerces numeric strings", () => {
    const out = lineartSchema.parse({
      threshold1: "60",
      threshold2: "180",
      line_thickness: "3",
      blur_amount: "5",
      min_contour_area: "300",
      invert: false,
      smoothness: "0.01",
    })
    expect(out.threshold1).toBe(60)
    expect(out.smoothness).toBeCloseTo(0.01)
  })

  it("rejects threshold1 >= threshold2", () => {
    expect(lineartSchema.safeParse({ threshold1: 200, threshold2: 200 }).success).toBe(false)
    expect(lineartSchema.safeParse({ threshold1: 250, threshold2: 200 }).success).toBe(false)
  })

  it("rejects line_thickness out of [1, 10]", () => {
    expect(lineartSchema.safeParse({ line_thickness: 0 }).success).toBe(false)
    expect(lineartSchema.safeParse({ line_thickness: 11 }).success).toBe(false)
  })

  it("rejects blur_amount out of [0, 20]", () => {
    expect(lineartSchema.safeParse({ blur_amount: -1 }).success).toBe(false)
    expect(lineartSchema.safeParse({ blur_amount: 21 }).success).toBe(false)
  })

  it("rejects smoothness out of [0, 0.1]", () => {
    expect(lineartSchema.safeParse({ smoothness: -0.01 }).success).toBe(false)
    expect(lineartSchema.safeParse({ smoothness: 0.11 }).success).toBe(false)
  })

  it("accepts smoothness at boundary 0.1", () => {
    expect(lineartSchema.safeParse({ smoothness: 0.1 }).success).toBe(true)
  })
})

describe("pixelateSchema", () => {
  it("applies defaults for empty input", () => {
    expect(pixelateSchema.parse({})).toEqual({
      superpixel_width: 10,
      superpixel_height: 10,
      num_colors: 16,
      color_mode: "rgb",
    })
  })

  it("coerces numeric strings", () => {
    const out = pixelateSchema.parse({
      superpixel_width: "20",
      superpixel_height: "15",
      num_colors: "32",
      color_mode: "grayscale",
    })
    expect(out).toEqual({
      superpixel_width: 20,
      superpixel_height: 15,
      num_colors: 32,
      color_mode: "grayscale",
    })
  })

  it("rejects superpixel_width below 1", () => {
    expect(pixelateSchema.safeParse({ superpixel_width: 0 }).success).toBe(false)
    expect(pixelateSchema.safeParse({ superpixel_width: -5 }).success).toBe(false)
  })

  it("rejects num_colors below 2", () => {
    expect(pixelateSchema.safeParse({ num_colors: 1 }).success).toBe(false)
  })

  it("rejects num_colors above 256", () => {
    expect(pixelateSchema.safeParse({ num_colors: 257 }).success).toBe(false)
    expect(pixelateSchema.safeParse({ num_colors: 999 }).success).toBe(false)
  })

  it("rejects unknown color_mode", () => {
    expect(pixelateSchema.safeParse({ color_mode: "cmyk" }).success).toBe(false)
  })

  it("rejects non-numeric strings for numeric fields", () => {
    expect(pixelateSchema.safeParse({ superpixel_width: "abc" }).success).toBe(false)
  })
})
