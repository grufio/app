import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { coverageSelectPaintMap } from "./coverage-select"
import { l0Smooth } from "./l0-smooth"
import { detailToMinArea, segmentRegions, type PreviewImage } from "./linerate-preview"
import type { PaletteChip } from "./trace-cell-colors"

// Fixture: a real image downscaled to 160px RGBA + the 304-chip palette + the
// SERVER region counts (min_radius=0, so the paintability floor doesn't mask the
// comparison). Proves the client L0 + coverage + CC + merge pipeline lands near
// the server's region count — i.e. the L0 port removed the over-segmentation.
type Fixture = {
  width: number
  height: number
  flatten: number
  num_colors: number
  serverRef: Record<string, number>
  paletteOklab: [number, number, number][]
  paletteRgb: [number, number, number][]
  rgba: number[]
}
const fx: Fixture = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/linerate-preview-parity.fixture.json"), "utf-8"),
)

const palette: PaletteChip[] = fx.paletteOklab.map((oklab, i) => ({
  oklab,
  rgb: fx.paletteRgb[i],
  notation: String(i),
  color_name: null,
}))
const chipOklab = palette.map((c) => c.oklab)

function previewImage(): PreviewImage {
  return { width: fx.width, height: fx.height, rgba: Uint8ClampedArray.from(fx.rgba) }
}

describe("linerate preview parity: client L0 pipeline vs server region count", () => {
  // L0 depends only on flatten → compute once.
  const flattened = l0Smooth(previewImage(), fx.flatten)
  const paintMap = coverageSelectPaintMap(flattened, palette, fx.num_colors)
  const px = fx.width * fx.height

  for (const key of ["0.5", "0.75", "1.0"]) {
    const detail = Number(key)
    it(`detail=${key} lands near the server count (no texture-speckle blow-up)`, () => {
      const minArea = detailToMinArea(detail, px, 0)
      const { regionCount } = segmentRegions(paintMap, fx.width, fx.height, chipOklab, minArea)
      const ref = fx.serverRef[key]
      // eslint-disable-next-line no-console
      console.log(`detail=${detail}: client=${regionCount} server=${ref}`)
      // Same algorithm; not bit-identical (JS FFT ≠ numpy, 160px vs 480px work
      // res, coverage subsample). Assert the count is in the server's ballpark
      // (within 40%), NOT the 2–4× blow-up the Gaussian-blur preview produced.
      expect(regionCount).toBeGreaterThan(ref * 0.6)
      expect(regionCount).toBeLessThan(ref * 1.4)
    })
  }
})
