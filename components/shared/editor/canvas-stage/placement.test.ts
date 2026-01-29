import { describe, expect, it } from "vitest"

import { pickIntrinsicSize, shouldApplyPersistedTransform } from "./placement"

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

describe("shouldApplyPersistedTransform", () => {
  it("requires src, not already applied, not user-changed, and persisted size present", () => {
    expect(
      shouldApplyPersistedTransform({
        src: "s",
        appliedKey: null,
        userChanged: false,
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
        initialImageTransform: { widthPxU: undefined, heightPxU: 1n },
      })
    ).toBe(false)
  })
})

