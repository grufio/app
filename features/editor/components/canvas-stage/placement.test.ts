/**
 * Unit tests for `placement`.
 *
 * Focus:
 * - Intrinsic sizing selection and persisted-transform gating logic.
 * - Image placement derived from intrinsic DPI (Illustrator-style; the
 *   artboard has no DPI).
 */
import { describe, expect, it } from "vitest"

import { computeImagePlacementPx, FALLBACK_IMAGE_DPI, pickIntrinsicSize, shouldApplyPersistedTransform } from "./placement"

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

describe("computeImagePlacementPx", () => {
  it("keeps 1:1 size when image dpi is 72 (the fixed artboard baseline)", () => {
    const out = computeImagePlacementPx({
      artW: 1200,
      artH: 800,
      intrinsicW: 640,
      intrinsicH: 480,
      imageDpi: 72,
    })
    expect(out).toEqual({
      xPx: 600,
      yPx: 400,
      widthPx: 640,
      heightPx: 480,
    })
  })

  it("shrinks high-DPI images to match physical print size (300dpi → ×0.24)", () => {
    // 3000-px image at 300 dpi = 10 inch physical = 720 fix-72 px.
    const out = computeImagePlacementPx({
      artW: 2000,
      artH: 1000,
      intrinsicW: 3000,
      intrinsicH: 2000,
      imageDpi: 300,
    })
    expect(out).toEqual({
      xPx: 1000,
      yPx: 500,
      widthPx: 720,
      heightPx: 480,
    })
  })

  it("enlarges low-DPI images (36dpi → ×2)", () => {
    const out = computeImagePlacementPx({
      artW: 2000,
      artH: 1000,
      intrinsicW: 100,
      intrinsicH: 50,
      imageDpi: 36,
    })
    expect(out).toEqual({
      xPx: 1000,
      yPx: 500,
      widthPx: 200,
      heightPx: 100,
    })
  })

  it("uses 72 fallback when image dpi is missing", () => {
    const out = computeImagePlacementPx({
      artW: 1200,
      artH: 800,
      intrinsicW: 100,
      intrinsicH: 50,
      imageDpi: null,
    })
    expect(out).toEqual({
      xPx: 600,
      yPx: 400,
      widthPx: 100 * (72 / FALLBACK_IMAGE_DPI),
      heightPx: 50 * (72 / FALLBACK_IMAGE_DPI),
    })
  })

  it("returns null for invalid dimensions", () => {
    const out = computeImagePlacementPx({
      artW: 0,
      artH: 1000,
      intrinsicW: 1000,
      intrinsicH: 2000,
      imageDpi: 72,
    })
    expect(out).toBeNull()
  })
})

describe("shouldApplyPersistedTransform", () => {
  it("applies persisted transform when src + activeImageId + size are all present", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        userChanged: false,
        activeImageId: "img-1",
        initialImageTransform: { widthPxU: 1n, heightPxU: 1n },
      })
    ).toBe(true)
  })

  it("returns false when size is missing", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        userChanged: false,
        activeImageId: "img-1",
        initialImageTransform: { widthPxU: undefined, heightPxU: 1n },
      })
    ).toBe(false)
  })

  it("returns false when src is missing", () => {
    expect(
      shouldApplyPersistedTransform({
        src: undefined,
        userChanged: false,
        activeImageId: "img-1",
        initialImageTransform: { widthPxU: 1n, heightPxU: 1n },
      })
    ).toBe(false)
  })

  it("returns false when the user has already edited the canvas", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        userChanged: true,
        activeImageId: "img-1",
        initialImageTransform: { widthPxU: 1n, heightPxU: 1n },
      })
    ).toBe(false)
  })

  it("returns false when canvas has no activeImageId", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        userChanged: false,
        activeImageId: null,
        initialImageTransform: { widthPxU: 1n, heightPxU: 1n },
      })
    ).toBe(false)
  })

  it("returns false when initialImageTransform is null", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        userChanged: false,
        activeImageId: "img-1",
        initialImageTransform: null,
      })
    ).toBe(false)
  })
})
