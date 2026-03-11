import { describe, expect, it } from "vitest"

import { computeCenteredPlacementPx } from "./placement"
import { resolveRestoreImageRequest } from "./restore-controller"

describe("resolveRestoreImageRequest", () => {
  it("returns placement from the same centered-100%-size contract", () => {
    const out = resolveRestoreImageRequest({
      artW: 1200,
      artH: 800,
      baseSpec: { imageId: "img-1", widthPx: 640, heightPx: 480 },
    })
    const expectedPlacement = computeCenteredPlacementPx({
      artW: 1200,
      artH: 800,
      intrinsicW: 640,
      intrinsicH: 480,
    })
    expect(out).toEqual({
      ok: true,
      placement: expectedPlacement,
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
