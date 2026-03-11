import { describe, expect, it } from "vitest"

import { computeDpiRelativePlacementPx } from "./placement"
import { resolveRestoreImageRequest } from "./restore-controller"

describe("resolveRestoreImageRequest", () => {
  it("returns placement from the same DPI-relative contract", () => {
    const out = resolveRestoreImageRequest({
      artW: 1200,
      artH: 800,
      artboardDpi: 300,
      baseSpec: { imageId: "img-1", widthPx: 640, heightPx: 480, dpi: 72 },
    })
    const expectedPlacement = computeDpiRelativePlacementPx({
      artW: 1200,
      artH: 800,
      intrinsicW: 640,
      intrinsicH: 480,
      artboardDpi: 300,
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
      artboardDpi: 300,
      baseSpec: { imageId: "img-1", widthPx: 72, heightPx: 36, dpi: null },
    })
    expect(out).toEqual({
      ok: true,
      placement: {
        xPx: 600,
        yPx: 400,
        widthPx: 300,
        heightPx: 150,
      },
    })
  })

  it("returns not_ready for invalid artboard size", () => {
    const out = resolveRestoreImageRequest({
      artW: 0,
      artH: 800,
      artboardDpi: 300,
      baseSpec: { imageId: "img-1", widthPx: 640, heightPx: 480 },
    })
    expect(out).toEqual({ ok: false, reason: "not_ready" })
  })

  it("returns missing_base_spec when base spec is absent", () => {
    const out = resolveRestoreImageRequest({
      artW: 1200,
      artH: 800,
      artboardDpi: 300,
      baseSpec: null,
    })
    expect(out).toEqual({ ok: false, reason: "missing_base_spec" })
  })

  it("returns stale_base_spec when active image does not match base image", () => {
    const out = resolveRestoreImageRequest({
      artW: 1200,
      artH: 800,
      artboardDpi: 300,
      activeImageId: "img-2",
      baseSpec: { imageId: "img-1", widthPx: 640, heightPx: 480 },
    })
    expect(out).toEqual({ ok: false, reason: "stale_base_spec" })
  })
})
