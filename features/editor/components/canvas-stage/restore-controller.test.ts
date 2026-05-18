import { describe, expect, it } from "vitest"

import { computeImagePlacementPx } from "./placement"
import { resolveRestoreImageRequest } from "./restore-controller"

describe("resolveRestoreImageRequest", () => {
  it("returns placement derived from intrinsic image DPI", () => {
    const out = resolveRestoreImageRequest({
      artW: 1200,
      artH: 800,
      baseSpec: { imageId: "img-1", widthPx: 640, heightPx: 480, dpi: 72 },
    })
    const expectedPlacement = computeImagePlacementPx({
      artW: 1200,
      artH: 800,
      intrinsicW: 640,
      intrinsicH: 480,
      imageDpi: 72,
    })
    expect(out).toEqual({
      ok: true,
      placement: expectedPlacement,
    })
  })

  it("uses 72 fallback when base image dpi is missing", () => {
    const out = resolveRestoreImageRequest({
      artW: 1200,
      artH: 800,
      baseSpec: { imageId: "img-1", widthPx: 72, heightPx: 36, dpi: null },
    })
    expect(out).toEqual({
      ok: true,
      placement: {
        xPx: 600,
        yPx: 400,
        widthPx: 72,
        heightPx: 36,
      },
    })
  })

  it("returns not_ready for invalid artboard size", () => {
    const out = resolveRestoreImageRequest({
      artW: 0,
      artH: 800,
      baseSpec: { imageId: "img-1", widthPx: 640, heightPx: 480 },
    })
    expect(out).toEqual({ ok: false, reason: "not_ready" })
  })

  it("returns missing_base_spec when base spec is absent", () => {
    const out = resolveRestoreImageRequest({
      artW: 1200,
      artH: 800,
      baseSpec: null,
    })
    expect(out).toEqual({ ok: false, reason: "missing_base_spec" })
  })

  it("returns stale_base_spec when active image does not match base image", () => {
    const out = resolveRestoreImageRequest({
      artW: 1200,
      artH: 800,
      activeImageId: "img-2",
      baseSpec: { imageId: "img-1", widthPx: 640, heightPx: 480 },
    })
    expect(out).toEqual({ ok: false, reason: "stale_base_spec" })
  })
})
