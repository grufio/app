/**
 * Unit tests for the pure `deriveInitialImageTxU` helper exported from
 * `use-canvas-tx-mirror.ts`.
 *
 * The React-bound hook itself is covered by the .tsx counterpart;
 * this file tests the gate logic in isolation so a regression in
 * "when should the SSR seed be exposed as a panel tx" is caught
 * cheaply.
 */
import { describe, expect, it } from "vitest"

import { deriveInitialImageTxU } from "./use-canvas-tx-mirror"

describe("deriveInitialImageTxU", () => {
  const validSeed = { xPxU: 10n, yPxU: 20n, widthPxU: 100n, heightPxU: 200n }

  it("returns null when activeCanvasImageId is null", () => {
    expect(deriveInitialImageTxU({ activeCanvasImageId: null, initialImageTransform: validSeed })).toBe(null)
  })

  it("returns null when initialImageTransform is null", () => {
    expect(deriveInitialImageTxU({ activeCanvasImageId: "img-1", initialImageTransform: null })).toBe(null)
  })

  it("returns null when widthPxU is undefined", () => {
    expect(
      deriveInitialImageTxU({
        activeCanvasImageId: "img-1",
        initialImageTransform: { ...validSeed, widthPxU: undefined },
      })
    ).toBe(null)
  })

  it("returns null when widthPxU is zero or negative", () => {
    expect(
      deriveInitialImageTxU({
        activeCanvasImageId: "img-1",
        initialImageTransform: { ...validSeed, widthPxU: 0n },
      })
    ).toBe(null)
    expect(
      deriveInitialImageTxU({
        activeCanvasImageId: "img-1",
        initialImageTransform: { ...validSeed, widthPxU: -1n },
      })
    ).toBe(null)
  })

  it("returns null when heightPxU is undefined or non-positive", () => {
    expect(
      deriveInitialImageTxU({
        activeCanvasImageId: "img-1",
        initialImageTransform: { ...validSeed, heightPxU: undefined },
      })
    ).toBe(null)
    expect(
      deriveInitialImageTxU({
        activeCanvasImageId: "img-1",
        initialImageTransform: { ...validSeed, heightPxU: 0n },
      })
    ).toBe(null)
  })

  it("returns the full tuple when all inputs valid", () => {
    expect(
      deriveInitialImageTxU({
        activeCanvasImageId: "img-1",
        initialImageTransform: validSeed,
      })
    ).toEqual({ x: 10n, y: 20n, w: 100n, h: 200n })
  })

  it("defaults missing xPxU and yPxU to 0n (SSR rows may omit position)", () => {
    expect(
      deriveInitialImageTxU({
        activeCanvasImageId: "img-1",
        initialImageTransform: { widthPxU: 100n, heightPxU: 200n },
      })
    ).toEqual({ x: 0n, y: 0n, w: 100n, h: 200n })
  })
})
