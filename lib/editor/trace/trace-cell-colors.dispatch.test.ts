/**
 * PR-F dispatch contract for the client preview: `mapCellsDithered`
 * selects the right algorithm via `ditherMode`, gracefully falls back
 * to the plain snap when KY is requested without a LUT, and never
 * leaks non-palette colours.
 *
 * Sister to `filter-service/tests/test_cell_colors_dispatch.py` — the
 * same shape contracts hold on both sides so preview ↔ apply parity
 * doesn't drift.
 */
import { describe, expect, it } from "vitest"

import { rgb255ToOklab, type Oklab } from "@/lib/color/oklab"

import { BLUE_NOISE_LUT_SIZE, type BlueNoiseLut } from "./knoll-yliluoma"
import {
  mapCellsDithered,
  mapCellsToPalette,
  type CellColors,
  type PaletteChip,
} from "./trace-cell-colors"

/** Build a {@link PaletteChip}[] from RGB triples, computing the OKLab
 * coords on the fly so the test fixtures stay readable. */
function makePalette(rgbs: ReadonlyArray<[number, number, number]>): PaletteChip[] {
  return rgbs.map((rgb) => ({
    rgb,
    oklab: rgb255ToOklab(rgb[0], rgb[1], rgb[2]) as Oklab,
    notation: "",
    color_name: null,
  }))
}

/** Fill an `H × W` cell grid with a single RGB triple. */
function uniformCells(H: number, W: number, rgb: [number, number, number]): CellColors {
  const n = H * W
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i += 1) {
    r[i] = rgb[0]
    g[i] = rgb[1]
    b[i] = rgb[2]
  }
  return { r, g, b }
}

/** A simple LFSR-style deterministic byte stream so the parity test
 * fixtures don't depend on Math.random and stay the same shape as the
 * Python `rng.integers(...)` in `test_cell_colors_dispatch.py`. */
function pseudoCells(H: number, W: number, seed: number): CellColors {
  const n = H * W
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)
  let s = seed >>> 0
  for (let i = 0; i < n; i += 1) {
    s = (1664525 * s + 1013904223) >>> 0
    r[i] = s & 0xff
    s = (1664525 * s + 1013904223) >>> 0
    g[i] = s & 0xff
    s = (1664525 * s + 1013904223) >>> 0
    b[i] = s & 0xff
  }
  return { r, g, b }
}

/** Build a deterministic blue-noise-like LUT (NOT the real binary) so
 * tests don't need to fetch `/assets/blue-noise-256.bin`. Real KY ↔
 * Python parity is asserted in `knoll-yliluoma.test.ts`. */
function syntheticLut(): BlueNoiseLut {
  const lut = new Uint8Array(BLUE_NOISE_LUT_SIZE * BLUE_NOISE_LUT_SIZE)
  for (let y = 0; y < BLUE_NOISE_LUT_SIZE; y += 1) {
    for (let x = 0; x < BLUE_NOISE_LUT_SIZE; x += 1) {
      lut[y * BLUE_NOISE_LUT_SIZE + x] = (y * 73 + x * 137) & 0xff
    }
  }
  return lut
}

describe("mapCellsDithered — PR-F dispatch contract (Python parity)", () => {
  it("`ditherMode='none'` equals plain `mapCellsToPalette`", () => {
    // The whole point of the default: switching a persisted trace row
    // from the legacy snap to the new dispatch must change nothing.
    const palette = makePalette([
      [0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255],
    ])
    const cells = pseudoCells(8, 11, 7)
    const legacy = mapCellsToPalette(cells, palette, 1.0)
    const dispatched = mapCellsDithered({
      cells,
      cellsX: 11,
      cellsY: 8,
      palette,
      ditherMode: "none",
    })
    expect(Array.from(dispatched.r)).toEqual(Array.from(legacy.r))
    expect(Array.from(dispatched.g)).toEqual(Array.from(legacy.g))
    expect(Array.from(dispatched.b)).toEqual(Array.from(legacy.b))
  })

  it("Knoll-Yliluoma without a LUT falls back to the snap (preview-loading safety)", () => {
    // The preview pane fetches the LUT asynchronously — until it lands,
    // KY must degrade to the plain snap rather than throw, otherwise
    // changing dither_mode would blank the preview.
    const palette = makePalette([[0, 0, 0], [128, 128, 128], [255, 255, 255]])
    const cells = pseudoCells(4, 4, 21)
    const noLut = mapCellsDithered({
      cells,
      cellsX: 4,
      cellsY: 4,
      palette,
      ditherMode: "knoll_yliluoma",
      ditherPatternSize: 4,
      blueNoiseLut: null,
    })
    const snap = mapCellsToPalette(cells, palette, 1.0)
    expect(Array.from(noLut.r)).toEqual(Array.from(snap.r))
    expect(Array.from(noLut.g)).toEqual(Array.from(snap.g))
    expect(Array.from(noLut.b)).toEqual(Array.from(snap.b))
  })

  it("Knoll-Yliluoma with a LUT dithers a uniform mid-gray field", () => {
    const palette = makePalette([[0, 0, 0], [255, 255, 255]])
    const cells = uniformCells(16, 16, [128, 128, 128])
    const out = mapCellsDithered({
      cells,
      cellsX: 16,
      cellsY: 16,
      palette,
      ditherMode: "knoll_yliluoma",
      ditherPatternSize: 4,
      blueNoiseLut: syntheticLut(),
    })
    const distinct = new Set<string>()
    for (let i = 0; i < out.r.length; i += 1) {
      distinct.add(`${out.r[i]},${out.g[i]},${out.b[i]}`)
    }
    expect(distinct.size).toBeGreaterThanOrEqual(2)
  })

  it("Floyd-Steinberg dithers a uniform mid-gray field (no LUT needed)", () => {
    const palette = makePalette([[0, 0, 0], [255, 255, 255]])
    const cells = uniformCells(16, 16, [128, 128, 128])
    const out = mapCellsDithered({
      cells,
      cellsX: 16,
      cellsY: 16,
      palette,
      ditherMode: "floyd_steinberg",
    })
    const distinct = new Set<string>()
    for (let i = 0; i < out.r.length; i += 1) {
      distinct.add(`${out.r[i]},${out.g[i]},${out.b[i]}`)
    }
    expect(distinct.size).toBeGreaterThanOrEqual(2)
  })

  it("every dispatched output is exactly one palette chip", () => {
    // Mirror of the Python contract — the dispatch must never leak an
    // intermediate colour (e.g. an OKLab→RGB round-trip drift).
    const palette = makePalette([
      [0, 0, 0], [50, 50, 50], [128, 128, 128], [200, 200, 200], [255, 255, 255],
    ])
    const chipSet = new Set(palette.map((c) => c.rgb.join(",")))
    const cells = pseudoCells(6, 9, 42)
    for (const mode of ["none", "knoll_yliluoma", "floyd_steinberg"] as const) {
      const out = mapCellsDithered({
        cells,
        cellsX: 9,
        cellsY: 6,
        palette,
        ditherMode: mode,
        ditherPatternSize: 4,
        blueNoiseLut: syntheticLut(),
      })
      for (let i = 0; i < out.r.length; i += 1) {
        const triple = `${out.r[i]},${out.g[i]},${out.b[i]}`
        expect(chipSet.has(triple), `${mode}: leaked ${triple}`).toBe(true)
      }
    }
  })

  it("Knoll-Yliluoma pattern_size=1 collapses to the snap", () => {
    // Yliluoma 2014 §2: the first candidate is always argmin, so N=1
    // by construction equals plain nearest-neighbour. This keeps the
    // mode select meaningful even at the lowest pattern size.
    const palette = makePalette([
      [0, 0, 0], [128, 128, 128], [255, 0, 0], [255, 255, 255],
    ])
    const cells = pseudoCells(7, 11, 21)
    const snap = mapCellsDithered({
      cells,
      cellsX: 11,
      cellsY: 7,
      palette,
      ditherMode: "none",
    })
    const ky1 = mapCellsDithered({
      cells,
      cellsX: 11,
      cellsY: 7,
      palette,
      ditherMode: "knoll_yliluoma",
      ditherPatternSize: 1,
      blueNoiseLut: syntheticLut(),
    })
    expect(Array.from(ky1.r)).toEqual(Array.from(snap.r))
    expect(Array.from(ky1.g)).toEqual(Array.from(snap.g))
    expect(Array.from(ky1.b)).toEqual(Array.from(snap.b))
  })

  it("rejects mismatched cells length / shape", () => {
    const palette = makePalette([[0, 0, 0], [255, 255, 255]])
    const cells = pseudoCells(4, 4, 1)
    // Right path (none) doesn't care about shape — flows through `mapCellsToPalette`.
    expect(() =>
      mapCellsDithered({ cells, cellsX: 5, cellsY: 5, palette, ditherMode: "floyd_steinberg" }),
    ).toThrow(/cells length/)
  })

  it("empty palette returns input unchanged across every mode", () => {
    const cells = pseudoCells(3, 5, 11)
    for (const mode of ["none", "knoll_yliluoma", "floyd_steinberg"] as const) {
      const out = mapCellsDithered({
        cells,
        cellsX: 5,
        cellsY: 3,
        palette: [],
        ditherMode: mode,
        blueNoiseLut: syntheticLut(),
      })
      expect(out).toBe(cells)
    }
  })
})
