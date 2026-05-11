import { describe, expect, it } from "vitest"

import { lineartSchema } from "./lineart"
import { numerateSchema, numerateTrace } from "./numerate"
import { TRACE_REGISTRY } from "./registry"
import type { TraceRenderContext } from "./types"

describe("TRACE_REGISTRY UI hints", () => {
  it("each ui-hint field has a matching schema field", () => {
    for (const trace of Object.values(TRACE_REGISTRY)) {
      if (!trace.ui) continue
      for (const fieldName of Object.keys(trace.ui)) {
        const ok = trace.schema.safeParse({ [fieldName]: undefined }).success ||
          trace.schema.safeParse({}).success
        expect(ok, `${trace.id}.${fieldName}`).toBe(true)
      }
    }
  })

  it("each ui-hint accepts the schema's default value", () => {
    for (const trace of Object.values(TRACE_REGISTRY)) {
      if (!trace.ui) continue
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
      if (!trace.ui) continue
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

describe("numerateTrace.transformBeforeSubmit", () => {
  // Numerate's superpixel_width / _height are not in its form — the
  // Pixelate filter earlier in the chain decides them, and the
  // transform injects them right before submit.
  const ctx: TraceRenderContext = {
    imageWidth: 1024,
    imageHeight: 768,
    numerateSuperpixelWidth: 17,
    numerateSuperpixelHeight: 23,
  }

  it("injects numerate superpixel dimensions from context", () => {
    const params = numerateSchema.parse({})
    const out = numerateTrace.transformBeforeSubmit?.({ params, ctx })
    expect(out?.superpixel_width).toBe(17)
    expect(out?.superpixel_height).toBe(23)
  })

  it("preserves user-collected stroke_width and show_colors", () => {
    const params = numerateSchema.parse({ stroke_width: 7, show_colors: false })
    const out = numerateTrace.transformBeforeSubmit?.({ params, ctx })
    expect(out?.stroke_width).toBe(7)
    expect(out?.show_colors).toBe(false)
  })

  it("returns a payload the schema accepts back", () => {
    const params = numerateSchema.parse({})
    const out = numerateTrace.transformBeforeSubmit?.({ params, ctx })
    expect(numerateSchema.safeParse(out).success).toBe(true)
  })
})

describe("TRACE_REGISTRY UI label coverage", () => {
  // Form-rendered fields must carry a `label` in the registry.
  // Numerate's superpixel_width / _height are injected by the
  // controller from Pixelate's grid math (not surfaced in the form),
  // so they're explicitly excluded here.
  const FIELDS_NOT_RENDERED_IN_FORM: Partial<Record<keyof typeof TRACE_REGISTRY, ReadonlyArray<string>>> = {
    numerate: ["superpixel_width", "superpixel_height"],
  }

  it("each form-rendered ui-hint has a non-empty label", () => {
    for (const [traceId, trace] of Object.entries(TRACE_REGISTRY)) {
      if (!trace.ui) continue
      const skip = new Set(FIELDS_NOT_RENDERED_IN_FORM[traceId as keyof typeof TRACE_REGISTRY] ?? [])
      for (const [fieldName, hint] of Object.entries(trace.ui)) {
        if (skip.has(fieldName)) continue
        const label = (hint as { label?: string }).label
        expect(typeof label, `${traceId}.${fieldName}.label is missing`).toBe("string")
        expect((label ?? "").trim().length, `${traceId}.${fieldName}.label is empty`).toBeGreaterThan(0)
      }
    }
  })
})

describe("TRACE_REGISTRY", () => {
  it("exposes numerate", () => {
    expect(TRACE_REGISTRY.numerate.id).toBe("numerate")
    expect(TRACE_REGISTRY.numerate.label).toBe("Numerate")
    expect(TRACE_REGISTRY.numerate.schema).toBe(numerateSchema)
  })

  it("exposes lineart", () => {
    expect(TRACE_REGISTRY.lineart.id).toBe("lineart")
    expect(TRACE_REGISTRY.lineart.label).toBe("Line Art")
    expect(TRACE_REGISTRY.lineart.schema).toBe(lineartSchema)
  })
})

describe("numerateSchema", () => {
  it("applies defaults matching frontend + Python", () => {
    expect(numerateSchema.parse({})).toEqual({
      superpixel_width: 10,
      superpixel_height: 10,
      stroke_width: 2,
      show_colors: true,
      num_colors: 16,
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
  it("applies defaults matching frontend + Python", () => {
    expect(lineartSchema.parse({})).toEqual({
      line_thickness: 2,
      blur_amount: 3,
      smoothness: 0.6,
      num_colors: 8,
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

  it("rejects line_thickness out of [1, 10]", () => {
    expect(lineartSchema.safeParse({ line_thickness: 0 }).success).toBe(false)
    expect(lineartSchema.safeParse({ line_thickness: 11 }).success).toBe(false)
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
