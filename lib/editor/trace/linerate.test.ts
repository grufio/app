import { describe, expect, it } from "vitest"

import { LINERATE_LEVELS, LINERATE_RESOLUTION_EDGE, levelToUnit, linerateSchema, unitToLevel } from "./linerate"

describe("linerate resolution dial", () => {
  it("defaults to medium (720)", () => {
    expect(linerateSchema.parse({}).resolution).toBe("medium")
    expect(LINERATE_RESOLUTION_EDGE.medium).toBe(720)
  })

  it("maps the three presets to work-edge px", () => {
    expect(LINERATE_RESOLUTION_EDGE).toEqual({ low: 640, medium: 720, high: 960 })
  })

  it("accepts the three presets and rejects anything else", () => {
    for (const r of ["low", "medium", "high"] as const) {
      expect(linerateSchema.parse({ resolution: r }).resolution).toBe(r)
    }
    expect(linerateSchema.safeParse({ resolution: "ultra" }).success).toBe(false)
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
