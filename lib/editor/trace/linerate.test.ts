import { describe, expect, it } from "vitest"

import { LINERATE_RESOLUTION_EDGE, linerateSchema } from "./linerate"

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
