import { describe, expect, it } from "vitest"

import { parseFormNumber } from "@/lib/forms/zod-input-props"

import {
  NUM_COLORS_DIALOG_MAX,
  NUM_COLORS_FULL_PALETTE,
  numColorsDialogSchema,
  numColorsSchema,
} from "./num-colors-schema"

describe("num_colors: validation budget vs dialog selection", () => {
  it("the validation cap is the full colour palette (560)", () => {
    expect(NUM_COLORS_FULL_PALETTE).toBe(560)
    expect(numColorsSchema.parse(560)).toBe(560)
    expect(numColorsSchema.safeParse(561).success).toBe(false)
    expect(numColorsSchema.safeParse(1).success).toBe(false)
  })

  it("the dialog cap is smaller (64) and independent of the validation cap", () => {
    expect(NUM_COLORS_DIALOG_MAX).toBe(64)
    expect(numColorsDialogSchema.parse(64)).toBe(64)
    expect(numColorsDialogSchema.safeParse(65).success).toBe(false)
    // decoupled: the dialog cap must sit below the full-palette validation cap.
    expect(NUM_COLORS_DIALOG_MAX).toBeLessThan(NUM_COLORS_FULL_PALETTE)
  })

  it("the dialog control clamps a typed value to the dialog max, not the budget", () => {
    // The shared control binds to numColorsDialogSchema, so parseFormNumber
    // hard-clamps an over-max entry to 64 — the dialog can never emit a budget
    // above the dialog cap even though the request schema would accept up to 560.
    expect(parseFormNumber(numColorsDialogSchema, "128").value).toBe(64)
    expect(parseFormNumber(numColorsDialogSchema, "1").value).toBe(2)
    expect(parseFormNumber(numColorsSchema, "128").value).toBe(128) // budget path is unclamped ≤560
  })
})
