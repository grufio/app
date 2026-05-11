import { describe, expect, it } from "vitest"

import { numerateSchema, type NumerateParams } from "@/lib/editor/trace/numerate"

import {
  canJumpTo,
  isFullyValid,
  stepValidity,
  STEPS,
  type WorkspaceDimensions,
} from "./step-validation"

const validDraft: NumerateParams = numerateSchema.parse({})
const validWorkspace: WorkspaceDimensions = { widthPx: 800, heightPx: 600 }

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

  it("marks colors invalid when stroke_width is out of range", () => {
    expect(stepValidity({ ...validDraft, stroke_width: 0.05 }, validWorkspace).colors).toBe(false)
    expect(stepValidity({ ...validDraft, stroke_width: 21 }, validWorkspace).colors).toBe(false)
  })

  it("marks colors invalid when num_colors is out of range", () => {
    expect(stepValidity({ ...validDraft, num_colors: 1 }, validWorkspace).colors).toBe(false)
    expect(stepValidity({ ...validDraft, num_colors: 300 }, validWorkspace).colors).toBe(false)
  })

  it("marks output invalid when workspace dimensions are missing", () => {
    expect(stepValidity(validDraft, { widthPx: null, heightPx: null }).output).toBe(false)
    expect(stepValidity(validDraft, { widthPx: 800, heightPx: null }).output).toBe(false)
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
