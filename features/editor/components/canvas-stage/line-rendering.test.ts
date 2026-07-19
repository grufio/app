import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { getStaticLineRenderProps, TRACE_CONTOUR_STROKE_CSS_PX } from "./line-rendering"

describe("getStaticLineRenderProps", () => {
  it("returns standardized non-interactive crisp line props", () => {
    expect(getStaticLineRenderProps(1)).toEqual({
      strokeWidth: 1,
      strokeScaleEnabled: false,
      listening: false,
      perfectDrawEnabled: false,
      hitStrokeWidth: 0,
    })
  })
})

describe("TRACE_CONTOUR_STROKE_CSS_PX (shared trace-contour width)", () => {
  it("is a constant 1 CSS pixel", () => {
    // 1 CSS px renders as a solid hairline on BOTH substrates: device-snapped
    // Konva (pixelate/circulate) and the un-snappable linerate DOM SVG. `1/dpr`
    // would antialias to grey on the DOM path — see line-rendering.ts.
    expect(TRACE_CONTOUR_STROKE_CSS_PX).toBe(1)
  })

  it("feeds a crisp non-scaling Konva stroke", () => {
    expect(getStaticLineRenderProps(TRACE_CONTOUR_STROKE_CSS_PX)).toMatchObject({
      strokeWidth: 1,
      strokeScaleEnabled: false,
    })
  })

  // Root-cause guard: the trace contour drifted because its width was inlined as
  // `1 / dpr` at three independent call sites. Pin all three to the shared
  // constant so they cannot silently diverge again.
  const here = dirname(fileURLToPath(import.meta.url))
  const contourOverlays = ["pixelate-trace-overlay.tsx", "circulate-trace-overlay.tsx", "trace-inline-svg.tsx"]

  for (const file of contourOverlays) {
    it(`${file} consumes the shared constant, not an inlined 1/dpr stroke`, () => {
      const src = readFileSync(join(here, file), "utf8")
      expect(src).toContain("TRACE_CONTOUR_STROKE_CSS_PX")
      expect(src).not.toMatch(/1\s*\/\s*dpr/)
    })
  }
})
