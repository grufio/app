import { describe, expect, it } from "vitest"

import { numerateSchema, type NumerateParams } from "@/lib/editor/trace/numerate"

import {
  canJumpTo,
  isFullyValid,
  stepValidity,
  STEPS,
  supercellMeetsMinSize,
  type WorkspaceDimensions,
} from "./step-validation"

// At 72 dpi a 12 px supercell is 12/72*25.4 ≈ 4.23 mm — clears the
// 4 mm minimum; the schema's 10 px default would not.
const validDraft: NumerateParams = {
  ...numerateSchema.parse({}),
  superpixel_width: 12,
  superpixel_height: 12,
}
const validWorkspace: WorkspaceDimensions = { widthPx: 800, heightPx: 600, dpi: 72 }

describe("STEPS", () => {
  it("orders grid -> colors -> output", () => {
    expect(STEPS.map((s) => s.id)).toEqual(["grid", "colors", "output"])
  })
})

describe("stepValidity", () => {
  it("returns all valid for a default draft and a sized workspace", () => {
    expect(stepValidity(validDraft, validWorkspace)).toEqual({
      grid: true,
      colors: true,
      output: true,
    })
  })

  it("marks grid invalid when a superpixel dimension is below 0.1", () => {
    const draft: NumerateParams = { ...validDraft, superpixel_width: 0.05 }
    expect(stepValidity(draft, validWorkspace).grid).toBe(false)
  })

  it("marks grid invalid when a supercell is below MIN_SUPERCELL_MM", () => {
    // 8 px at 72 dpi ≈ 2.82 mm — under the 4 mm minimum.
    const draft: NumerateParams = { ...validDraft, superpixel_width: 8 }
    expect(stepValidity(draft, validWorkspace).grid).toBe(false)
  })

  it("skips the 4mm rule when dpi is null (output step gates instead)", () => {
    const draft: NumerateParams = { ...validDraft, superpixel_width: 1, superpixel_height: 1 }
    expect(stepValidity(draft, { ...validWorkspace, dpi: null }).grid).toBe(true)
  })

  it("marks colors invalid when stroke_width is out of range", () => {
    expect(stepValidity({ ...validDraft, stroke_width: 0.05 }, validWorkspace).colors).toBe(false)
    expect(stepValidity({ ...validDraft, stroke_width: 21 }, validWorkspace).colors).toBe(false)
  })

  it("marks colors invalid when num_colors is out of range", () => {
    expect(stepValidity({ ...validDraft, num_colors: 1 }, validWorkspace).colors).toBe(false)
    expect(stepValidity({ ...validDraft, num_colors: 300 }, validWorkspace).colors).toBe(false)
  })

  it("marks output invalid when workspace dimensions are missing", () => {
    expect(stepValidity(validDraft, { widthPx: null, heightPx: null, dpi: 72 }).output).toBe(false)
    expect(stepValidity(validDraft, { widthPx: 800, heightPx: null, dpi: 72 }).output).toBe(false)
  })
})

describe("supercellMeetsMinSize", () => {
  it("passes when both axes are at least 4mm at the given dpi", () => {
    // 12 px @ 72 dpi ≈ 4.23 mm
    expect(supercellMeetsMinSize({ ...validDraft, superpixel_width: 12, superpixel_height: 12 }, 72)).toBe(true)
  })

  it("fails when either axis is below 4mm", () => {
    expect(supercellMeetsMinSize({ ...validDraft, superpixel_width: 8, superpixel_height: 12 }, 72)).toBe(false)
    expect(supercellMeetsMinSize({ ...validDraft, superpixel_width: 12, superpixel_height: 8 }, 72)).toBe(false)
  })

  it("scales with dpi — the same pitch fails at a higher dpi", () => {
    // 12 px @ 300 dpi ≈ 1.02 mm
    expect(supercellMeetsMinSize({ ...validDraft, superpixel_width: 12, superpixel_height: 12 }, 300)).toBe(false)
  })

  it("passes (rule deferred) when dpi is null", () => {
    expect(supercellMeetsMinSize({ ...validDraft, superpixel_width: 0.1, superpixel_height: 0.1 }, null)).toBe(true)
  })
})

describe("isFullyValid", () => {
  it("requires all three steps", () => {
    expect(isFullyValid({ grid: true, colors: true, output: true })).toBe(true)
    expect(isFullyValid({ grid: false, colors: true, output: true })).toBe(false)
    expect(isFullyValid({ grid: true, colors: false, output: true })).toBe(false)
    expect(isFullyValid({ grid: true, colors: true, output: false })).toBe(false)
  })
})

describe("canJumpTo", () => {
  const allValid = { grid: true, colors: true, output: true } as const

  it("permits staying on the current step", () => {
    expect(canJumpTo("grid", "grid", allValid)).toBe(true)
  })

  it("permits stepping backward regardless of validity", () => {
    const invalid = { grid: false, colors: false, output: false }
    expect(canJumpTo("grid", "output", invalid)).toBe(true)
  })

  it("permits stepping forward only when prior steps are valid", () => {
    expect(canJumpTo("colors", "grid", allValid)).toBe(true)
    expect(
      canJumpTo("colors", "grid", { grid: false, colors: true, output: true }),
    ).toBe(false)
  })

  it("requires all prior steps to be valid to jump to output", () => {
    expect(canJumpTo("output", "grid", allValid)).toBe(true)
    expect(
      canJumpTo("output", "grid", { grid: true, colors: false, output: true }),
    ).toBe(false)
    expect(
      canJumpTo("output", "grid", { grid: false, colors: true, output: true }),
    ).toBe(false)
  })
})
