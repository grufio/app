import { describe, expect, it } from "vitest"

import { pixelateSchema } from "./pixelate"
import { FILTER_REGISTRY } from "./registry"

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
        const min = (hint as { min?: number }).min
        const max = (hint as { max?: number }).max
        if (min != null) expect(v, `${filter.id}.${fieldName} default below ui.min`).toBeGreaterThanOrEqual(min)
        if (max != null) expect(v, `${filter.id}.${fieldName} default above ui.max`).toBeLessThanOrEqual(max)
      }
    }
  })

  it("each ui-hint min/max value is accepted by the schema (per-field bounds only)", () => {
    const isPerFieldBoundIssue = (
      issues: Array<{ path: ReadonlyArray<PropertyKey>; code?: string }>,
      fieldName: string,
    ) => issues.some((i) => i.path[0] === fieldName && i.code !== "custom")
    for (const filter of Object.values(FILTER_REGISTRY)) {
      if (!filter.ui) continue
      for (const [fieldName, hint] of Object.entries(filter.ui)) {
        const min = (hint as { min?: number }).min
        const max = (hint as { max?: number }).max
        if (min != null) {
          const r = filter.schema.safeParse({ [fieldName]: min })
          if (!r.success) {
            expect(
              isPerFieldBoundIssue(r.error.issues, fieldName),
              `${filter.id}.${fieldName}.min=${min} fails per-field bound`,
            ).toBe(false)
          }
        }
        if (max != null) {
          const r = filter.schema.safeParse({ [fieldName]: max })
          if (!r.success) {
            expect(
              isPerFieldBoundIssue(r.error.issues, fieldName),
              `${filter.id}.${fieldName}.max=${max} fails per-field bound`,
            ).toBe(false)
          }
        }
      }
    }
  })
})

describe("FILTER_REGISTRY UI label coverage", () => {
  it("each form-rendered ui-hint has a non-empty label", () => {
    for (const [filterId, filter] of Object.entries(FILTER_REGISTRY)) {
      if (!filter.ui) continue
      for (const [fieldName, hint] of Object.entries(filter.ui)) {
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
