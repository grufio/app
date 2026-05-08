import { describe, expect, it } from "vitest"

import { pixelateSchema } from "./pixelate"
import { FILTER_REGISTRY } from "./registry"

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
