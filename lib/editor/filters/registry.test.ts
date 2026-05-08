import { describe, expect, it } from "vitest"

import { lineartSchema } from "./lineart"
import { pixelateSchema } from "./pixelate"
import { FILTER_REGISTRY } from "./registry"

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
