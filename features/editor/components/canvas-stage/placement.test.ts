/**
 * Unit tests for `placement`.
 *
 * Focus:
 * - Intrinsic sizing selection and persisted-transform gating logic.
 */
import { describe, expect, it } from "vitest"

import { computeDpiRelativePlacementPx, FALLBACK_IMAGE_DPI, pickIntrinsicSize, shouldApplyPersistedTransform } from "./placement"

describe("pickIntrinsicSize", () => {
  it("prefers DB intrinsic size when present", () => {
    const out = pickIntrinsicSize({
      intrinsicWidthPx: 123,
      intrinsicHeightPx: 456,
      img: { naturalWidth: 999, naturalHeight: 999, width: 1, height: 1 },
    })
    expect(out).toEqual({ w: 123, h: 456 })
  })

  it("falls back to img.naturalWidth/naturalHeight", () => {
    const out = pickIntrinsicSize({
      intrinsicWidthPx: undefined,
      intrinsicHeightPx: undefined,
      img: { naturalWidth: 10, naturalHeight: 20, width: 30, height: 40 },
    })
    expect(out).toEqual({ w: 10, h: 20 })
  })

  it("falls back to img.width/img.height if natural is missing/zero", () => {
    const out = pickIntrinsicSize({
      intrinsicWidthPx: undefined,
      intrinsicHeightPx: undefined,
      img: { naturalWidth: 0, naturalHeight: 0, width: 30, height: 40 },
    })
    expect(out).toEqual({ w: 30, h: 40 })
  })
})

describe("computeDpiRelativePlacementPx", () => {
  it("keeps 1:1 size when image dpi equals artboard dpi", () => {
    const out = computeDpiRelativePlacementPx({
      artW: 1200,
      artH: 800,
      intrinsicW: 640,
      intrinsicH: 480,
      artboardDpi: 300,
      imageDpi: 300,
    })
    expect(out).toEqual({
      xPx: 600,
      yPx: 400,
      widthPx: 640,
      heightPx: 480,
    })
  })

  it("scales down when image dpi is higher than artboard dpi", () => {
    const out = computeDpiRelativePlacementPx({
      artW: 1200,
      artH: 800,
      intrinsicW: 600,
      intrinsicH: 400,
      artboardDpi: 300,
      imageDpi: 600,
    })
    expect(out).toEqual({
      xPx: 600,
      yPx: 400,
      widthPx: 300,
      heightPx: 200,
    })
  })

  it("scales up when image dpi is lower than artboard dpi", () => {
    const out = computeDpiRelativePlacementPx({
      artW: 1200,
      artH: 800,
      intrinsicW: 600,
      intrinsicH: 400,
      artboardDpi: 300,
      imageDpi: 150,
    })
    expect(out).toEqual({
      xPx: 600,
      yPx: 400,
      widthPx: 1200,
      heightPx: 800,
    })
  })

  it("uses 72 fallback when image dpi is missing", () => {
    const out = computeDpiRelativePlacementPx({
      artW: 1200,
      artH: 800,
      intrinsicW: 100,
      intrinsicH: 50,
      artboardDpi: 300,
      imageDpi: null,
    })
    expect(out).toEqual({
      xPx: 600,
      yPx: 400,
      widthPx: 100 * (300 / FALLBACK_IMAGE_DPI),
      heightPx: 50 * (300 / FALLBACK_IMAGE_DPI),
    })
  })

  it("returns null for invalid dimensions", () => {
    const out = computeDpiRelativePlacementPx({
      artW: 0,
      artH: 1000,
      intrinsicW: 1000,
      intrinsicH: 2000,
      artboardDpi: 300,
      imageDpi: 72,
    })
    expect(out).toBeNull()
  })
})

describe("shouldApplyPersistedTransform", () => {
  it("requires src, not already applied, not user-changed, and persisted size present", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        appliedKey: null,
        userChanged: false,
        activeImageId: "img-1",
        stateImageId: "img-1",
        initialImageTransform: { widthPxU: 1n, heightPxU: 1n },
      })
    ).toBe(true)
  })

  it("returns false when size is missing", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        appliedKey: null,
        userChanged: false,
        activeImageId: "img-1",
        stateImageId: "img-1",
        initialImageTransform: { widthPxU: undefined, heightPxU: 1n },
      })
    ).toBe(false)
  })

  it("returns false when persisted state is bound to another image", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        appliedKey: null,
        userChanged: false,
        activeImageId: "img-2",
        stateImageId: "img-1",
        initialImageTransform: { widthPxU: 1n, heightPxU: 1n },
      })
    ).toBe(false)
  })

  it("returns false when persisted state has no image binding", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        appliedKey: null,
        userChanged: false,
        activeImageId: "img-2",
        stateImageId: null,
        initialImageTransform: { widthPxU: 1n, heightPxU: 1n },
      })
    ).toBe(false)
  })
})
