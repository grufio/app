import { describe, expect, it } from "vitest"

import { resolveRestoreImageRequest } from "./restore-controller"

describe("resolveRestoreImageRequest", () => {
  it("returns base dimensions when ready and image ids match", () => {
    const out = resolveRestoreImageRequest({
      artW: 1200,
      artH: 800,
      baseSpec: { imageId: "img-1", widthPx: 640, heightPx: 480 },
    })
    expect(out).toEqual({ ok: true, baseW: 640, baseH: 480 })
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
})

