import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { getStaticLineRenderProps } from "./line-rendering"

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

describe("trace-contour hairline (single source of truth)", () => {
  // Root-cause guard: the trace contour drifted because its width was inlined as
  // `1 / dpr` at three independent call sites. All three applied-trace outlines
  // must now pull the width from the shared `useTraceContourStrokeCssPx` hook so
  // they cannot silently diverge — and no overlay may inline `1 / dpr` again.
  const here = dirname(fileURLToPath(import.meta.url))
  const contourOverlays = ["pixelate-trace-overlay.tsx", "circulate-trace-overlay.tsx", "trace-inline-svg.tsx"]

  for (const file of contourOverlays) {
    it(`${file} consumes the shared hook, not an inlined 1/dpr stroke`, () => {
      const src = readFileSync(join(here, file), "utf8")
      expect(src).toContain("useTraceContourStrokeCssPx")
      expect(src).not.toMatch(/1\s*\/\s*dpr/)
    })
  }
})
