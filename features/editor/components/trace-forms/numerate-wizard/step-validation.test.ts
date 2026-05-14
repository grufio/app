import { describe, expect, it } from "vitest"

import { numerateSchema, type NumerateParams } from "@/lib/editor/trace/numerate"

import {
  canJumpTo,
  isFullyValid,
  stepValidity,
  STEPS,
  type WizardContext,
} from "./step-validation"

const validDraft: NumerateParams = numerateSchema.parse({})
// 4000x3000 image: default draft (6mm square, 40 primary) resolves to
// a 40x30 grid with no border — fully valid.
const validCtx: WizardContext = {
  imageWidth: 4000,
  imageHeight: 3000,
  workspaceWidthPx: 800,
  workspaceHeightPx: 600,
}

describe("STEPS", () => {
  it("orders grid -> colors -> output", () => {
    expect(STEPS.map((s) => s.id)).toEqual(["grid", "colors", "output"])
  })
})

describe("stepValidity", () => {
  it("returns all valid for the default draft and a sized workspace", () => {
    expect(stepValidity(validDraft, validCtx)).toEqual({
      grid: true,
      colors: true,
      output: true,
    })
  })

  it("marks grid invalid when supercell_mm is below the minimum", () => {
    expect(stepValidity({ ...validDraft, supercell_mm: 3 }, validCtx).grid).toBe(false)
  })

  it("marks grid invalid when the resolved grid has no whole secondary cell", () => {
    // primary_count 1 on a 4000-wide image -> a 4000px-tall square
    // cell, taller than the 3000px image -> cellsY = 0.
    expect(stepValidity({ ...validDraft, primary_count: 1 }, validCtx).grid).toBe(false)
  })

  it("marks colors invalid when stroke_width is out of range", () => {
    expect(stepValidity({ ...validDraft, stroke_width: 0.05 }, validCtx).colors).toBe(false)
    expect(stepValidity({ ...validDraft, stroke_width: 21 }, validCtx).colors).toBe(false)
  })

  it("marks colors invalid when num_colors is out of range", () => {
    expect(stepValidity({ ...validDraft, num_colors: 1 }, validCtx).colors).toBe(false)
    expect(stepValidity({ ...validDraft, num_colors: 300 }, validCtx).colors).toBe(false)
  })

  it("marks output invalid when workspace dimensions are missing", () => {
    expect(stepValidity(validDraft, { ...validCtx, workspaceWidthPx: null, workspaceHeightPx: null }).output).toBe(false)
    expect(stepValidity(validDraft, { ...validCtx, workspaceHeightPx: null }).output).toBe(false)
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
