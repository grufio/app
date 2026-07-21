import { describe, expect, it } from "vitest"

import { LINERATE_LEVELS, LINERATE_RESOLUTION_MP, levelToUnit, linerateSchema, resolutionMpToWorkEdge, unitToLevel } from "./linerate"

describe("linerate resolution dial (MP targets)", () => {
  it("defaults to 2 MP", () => {
    expect(linerateSchema.parse({}).resolution).toBe(2)
  })

  it("offers 1 / 2 / 4 MP", () => {
    expect(LINERATE_RESOLUTION_MP).toEqual([1, 2, 4])
    for (const mp of LINERATE_RESOLUTION_MP) {
      expect(linerateSchema.parse({ resolution: mp }).resolution).toBe(mp)
    }
  })

  it("coerces the legacy low/medium/high presets to 1/2/4 MP", () => {
    expect(linerateSchema.parse({ resolution: "low" }).resolution).toBe(1)
    expect(linerateSchema.parse({ resolution: "medium" }).resolution).toBe(2)
    expect(linerateSchema.parse({ resolution: "high" }).resolution).toBe(4)
    expect(linerateSchema.parse({ resolution: "4" }).resolution).toBe(4) // a select emits a string
  })

  it("rejects unknown resolutions", () => {
    expect(linerateSchema.safeParse({ resolution: 3 }).success).toBe(false)
    expect(linerateSchema.safeParse({ resolution: "ultra" }).success).toBe(false)
  })
})

describe("resolutionMpToWorkEdge", () => {
  it("keeps total working pixels ≈ the MP target (aspect-invariant)", () => {
    for (const [w, h] of [[3869, 6000], [6000, 3869], [4000, 4000]] as const) {
      for (const mp of [1, 2, 4] as const) {
        const we = resolutionMpToWorkEdge(mp, w, h)
        const shortWork = (we * Math.min(w, h)) / Math.max(w, h)
        const px = we * shortWork
        expect(px).toBeGreaterThan(mp * 1e6 * 0.9)
        expect(px).toBeLessThan(mp * 1e6 * 1.1)
      }
    }
  })

  it("never upscales a source smaller than the target", () => {
    expect(resolutionMpToWorkEdge(4, 800, 600)).toBe(800)
  })

  it("clamps to [256, 8192] for pathological aspect ratios", () => {
    expect(resolutionMpToWorkEdge(4, 40000, 1000)).toBeLessThanOrEqual(8192)
    expect(resolutionMpToWorkEdge(1, 300, 100)).toBeGreaterThanOrEqual(256)
  })
})

describe("linerate 1–10 level scale (UI presentation of the 0–1 dials)", () => {
  it("round-trips every level 1..10", () => {
    for (const l of LINERATE_LEVELS) {
      expect(unitToLevel(levelToUnit(l))).toBe(l)
    }
  })

  it("maps the endpoints across the full 0–1 range", () => {
    expect(levelToUnit(1)).toBe(0)
    expect(levelToUnit(10)).toBe(1)
  })

  it("clamps out-of-range levels and units", () => {
    expect(levelToUnit(0)).toBe(0)
    expect(levelToUnit(99)).toBe(1)
    expect(unitToLevel(-1)).toBe(1)
    expect(unitToLevel(5)).toBe(10)
  })

  it("shows the current schema defaults at the expected levels", () => {
    const d = linerateSchema.parse({})
    expect(unitToLevel(d.flatten)).toBe(3) // 0.25
    expect(unitToLevel(d.detail)).toBe(8) // 0.75
    expect(unitToLevel(d.smoothness)).toBe(6) // 0.6
    expect(unitToLevel(d.radius)).toBe(4) // 0.333 — the "Radius" dial default
  })
})

describe("linerate num_colors default", () => {
  it("defaults the selection budget to 32", () => {
    expect(linerateSchema.parse({}).num_colors).toBe(32)
  })
})

describe("linerate radius (width-test) default", () => {
  it("defaults to 0.333 (the analysed knee) and shows as level 4", () => {
    const d = linerateSchema.parse({})
    expect(d.radius).toBeCloseTo(0.333)
    expect(unitToLevel(d.radius)).toBe(4)
    expect(levelToUnit(4)).toBeCloseTo(0.333, 2)
  })
})
