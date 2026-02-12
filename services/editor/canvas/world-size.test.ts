/**
 * Unit tests for computeWorldSize.
 */
import { describe, expect, it } from "vitest"

import { computeWorldSize } from "./world-size"

describe("computeWorldSize", () => {
  it("prefers artboard size", () => {
    expect(
      computeWorldSize({ artboardWidthPx: 100, artboardHeightPx: 200, intrinsicWidthPx: 1, intrinsicHeightPx: 1 })
    ).toEqual({ w: 100, h: 200 })
  })

  it("falls back to intrinsic size", () => {
    expect(computeWorldSize({ intrinsicWidthPx: 10, intrinsicHeightPx: 20, domWidthPx: 1, domHeightPx: 1 })).toEqual({
      w: 10,
      h: 20,
    })
  })

  it("falls back to DOM size last", () => {
    expect(computeWorldSize({ domWidthPx: 5, domHeightPx: 6 })).toEqual({ w: 5, h: 6 })
  })
})

