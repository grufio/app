import { describe, expect, it } from "vitest"

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
  it("exposes exactly the three B&W filters", () => {
    expect(Object.keys(FILTER_REGISTRY).sort()).toEqual(["bw_hard", "bw_soft", "bw_warm"])
  })

  it("each filter's registry key matches its id", () => {
    for (const [key, filter] of Object.entries(FILTER_REGISTRY)) {
      expect(filter.id).toBe(key)
    }
  })

  it("each B&W filter has a non-empty label and an empty (no-config) schema", () => {
    for (const filter of Object.values(FILTER_REGISTRY)) {
      expect(filter.label.trim().length).toBeGreaterThan(0)
      // No-config filters: schema accepts {} and rejects any field.
      expect(filter.schema.safeParse({}).success).toBe(true)
      expect(filter.schema.safeParse({ anything: 1 }).success).toBe(false)
      // No UI hints, no helper-state — these are direct-apply presets.
      expect(filter.ui).toBeUndefined()
      expect(filter.helperState).toBeUndefined()
    }
  })
})
