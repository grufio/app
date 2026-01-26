import { describe, expect, it } from "vitest"

import { clampMicroPx, MAX_PX_U, MIN_PX_U } from "./micro-px"

describe("micro-px clamp", () => {
  it("clamps below MIN_PX_U and above MAX_PX_U", () => {
    expect(clampMicroPx(0n)).toBe(MIN_PX_U)
    expect(clampMicroPx(MAX_PX_U + 1n)).toBe(MAX_PX_U)
    expect(clampMicroPx(MIN_PX_U)).toBe(MIN_PX_U)
    expect(clampMicroPx(MAX_PX_U)).toBe(MAX_PX_U)
  })
})
