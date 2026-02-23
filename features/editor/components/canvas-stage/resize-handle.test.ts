import { describe, expect, it } from "vitest"

import { applyResizeHandle, type FrameRect, type ResizeHandle } from "./resize-handle"

describe("applyResizeHandle", () => {
  const prev: FrameRect = { x: 10, y: 20, w: 100, h: 60 }

  it("supports all 8 handles with min size enforcement", () => {
    const handles: ResizeHandle[] = ["tl", "tm", "tr", "rm", "br", "bm", "bl", "lm"]
    for (const handle of handles) {
      const next = applyResizeHandle({
        prev,
        handle,
        pointerX: -999,
        pointerY: -999,
        minSize: 10,
        keepAspect: false,
      })
      expect(next.w).toBeGreaterThanOrEqual(10)
      expect(next.h).toBeGreaterThanOrEqual(10)
    }
  })

  it("keeps aspect ratio when requested", () => {
    const next = applyResizeHandle({
      prev,
      handle: "br",
      pointerX: 200,
      pointerY: 100,
      minSize: 10,
      keepAspect: true,
    })
    const prevAspect = prev.w / prev.h
    const nextAspect = next.w / next.h
    expect(Math.abs(nextAspect - prevAspect)).toBeLessThan(0.0001)
  })

  it("applies clamp callback after resize", () => {
    const next = applyResizeHandle({
      prev,
      handle: "br",
      pointerX: 400,
      pointerY: 400,
      minSize: 10,
      keepAspect: false,
      clamp: (r) => ({ ...r, w: Math.min(r.w, 50), h: Math.min(r.h, 40) }),
    })
    expect(next.w).toBe(50)
    expect(next.h).toBe(40)
  })
})
