/**
 * PR-H dispatch contract for the client preview: `mapCellsDithered`
 * + `mapCellsToPalette` route the snap step through the active
 * `distance_metric`. Sister to
 * `filter-service/tests/test_distance_metric_dispatch.py` — the same
 * shape contracts hold on both sides so preview ↔ apply parity
 * doesn't drift on the metric switch.
 */
import { describe, expect, it } from "vitest"

import { rgb255ToOklab, type Oklab } from "@/lib/color/oklab"

import {
  mapCellsDithered,
  mapCellsToPalette,
  type CellColors,
  type PaletteChip,
} from "./trace-cell-colors"

function makePalette(rgbs: ReadonlyArray<[number, number, number]>): PaletteChip[] {
  return rgbs.map((rgb) => ({
    rgb,
    oklab: rgb255ToOklab(rgb[0], rgb[1], rgb[2]) as Oklab,
    notation: "",
    color_name: null,
  }))
}

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

describe("mapCellsToPalette — distance_metric dispatch (PR-H)", () => {
  it("default `oklab` is byte-identical to the implicit-arg version", () => {
    // The pre-PR-H signature didn't take `distanceMetric`. Verify the
    // explicit `"oklab"` produces the same output as omitting the arg,
    // so callers that don't pass the metric stay unchanged.
    const palette = makePalette([
      [0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [128, 64, 32],
    ])
    const cells = pseudoCells(5, 7, 13)
    const implicit = mapCellsToPalette(cells, palette, 1.0)
    const explicit = mapCellsToPalette(cells, palette, 1.0, "oklab")
    expect(Array.from(explicit.r)).toEqual(Array.from(implicit.r))
    expect(Array.from(explicit.g)).toEqual(Array.from(implicit.g))
    expect(Array.from(explicit.b)).toEqual(Array.from(implicit.b))
  })

  it("ciede2000 picks the warm-tinted chip where oklab picks mid-gray", () => {
    // Same divergence fixture as the Python sister test
    // (test_distance_metric_ciede2000_can_shift_snap_winner) — a
    // desaturated warm target against a palette of mid-gray + tints.
    // OKLab over-weights L and picks mid-gray; CIEDE2000 picks the
    // warm chip. Pins the parity contract: same fixture in both.
    const palette = makePalette([
      [100, 100, 100], [150, 150, 150], [100, 100, 150], [150, 100, 100],
    ])
    const cells = uniformCells(4, 4, [120, 80, 80])
    const oklabOut = mapCellsToPalette(cells, palette, 1.0, "oklab")
    const ciedeOut = mapCellsToPalette(cells, palette, 1.0, "ciede2000")
    expect([oklabOut.r[0], oklabOut.g[0], oklabOut.b[0]]).toEqual([100, 100, 100])
    expect([ciedeOut.r[0], ciedeOut.g[0], ciedeOut.b[0]]).toEqual([150, 100, 100])
  })

  it("ciede2000 suppresses the OKLCh `preSnapChromaScale` boost", () => {
    // The boost lives in OKLCh; CIE LCh is a different space, so the
    // CIEDE2000 path skips the boost. Output must be byte-identical
    // regardless of the boost value when distance_metric="ciede2000".
    const palette = makePalette([
      [0, 0, 0], [180, 100, 100], [255, 0, 0], [255, 255, 255],
    ])
    const cells = uniformCells(4, 4, [150, 150, 150])
    const noBoost = mapCellsToPalette(cells, palette, 1.0, "ciede2000")
    const withBoost = mapCellsToPalette(cells, palette, 1.5, "ciede2000")
    expect(Array.from(noBoost.r)).toEqual(Array.from(withBoost.r))
    expect(Array.from(noBoost.g)).toEqual(Array.from(withBoost.g))
    expect(Array.from(noBoost.b)).toEqual(Array.from(withBoost.b))
  })
})

describe("mapCellsDithered — distance_metric dispatch (PR-H)", () => {
  it("`dither_mode=none` + ciede2000 == `mapCellsToPalette` + ciede2000", () => {
    // The dispatch tree must route the metric through to the snap path
    // when dithering is off — otherwise dither_mode='none' would
    // ignore the metric and lie to the user.
    const palette = makePalette([
      [100, 100, 100], [150, 150, 150], [100, 100, 150], [150, 100, 100],
    ])
    const cells = uniformCells(3, 3, [120, 80, 80])
    const direct = mapCellsToPalette(cells, palette, 1.0, "ciede2000")
    const viaDispatch = mapCellsDithered({
      cells,
      cellsX: 3,
      cellsY: 3,
      palette,
      ditherMode: "none",
      distanceMetric: "ciede2000",
    })
    expect(Array.from(viaDispatch.r)).toEqual(Array.from(direct.r))
    expect(Array.from(viaDispatch.g)).toEqual(Array.from(direct.g))
    expect(Array.from(viaDispatch.b)).toEqual(Array.from(direct.b))
  })

  it("dither_mode=floyd_steinberg ignores the metric (KY/FS use OKLab internally)", () => {
    // FS's argmin is hardcoded squared-Euclidean in OKLab; same for
    // KY. Flipping the metric must NOT change the FS output, otherwise
    // someone has accidentally wired the metric into the dither
    // algorithm's argmin and the contract drifts from the docstring.
    const palette = makePalette([
      [0, 0, 0], [40, 50, 200], [100, 30, 200], [255, 255, 255],
    ])
    const cells = uniformCells(4, 4, [60, 30, 200])
    const oklabFs = mapCellsDithered({
      cells,
      cellsX: 4,
      cellsY: 4,
      palette,
      ditherMode: "floyd_steinberg",
      distanceMetric: "oklab",
    })
    const ciedeFs = mapCellsDithered({
      cells,
      cellsX: 4,
      cellsY: 4,
      palette,
      ditherMode: "floyd_steinberg",
      distanceMetric: "ciede2000",
    })
    expect(Array.from(oklabFs.r)).toEqual(Array.from(ciedeFs.r))
    expect(Array.from(oklabFs.g)).toEqual(Array.from(ciedeFs.g))
    expect(Array.from(oklabFs.b)).toEqual(Array.from(ciedeFs.b))
  })

  it("every dispatched output is a palette chip across (mode, metric) combinations", () => {
    // Sanity matrix: every dither × metric combination must emit only
    // palette chips. Catches accidental colour-space leaks (e.g. an
    // OKLab → RGB round-trip drift) across the whole dispatch tree.
    const palette = makePalette([
      [0, 0, 0], [50, 50, 50], [128, 128, 128], [200, 200, 200],
      [255, 255, 255], [255, 0, 0], [0, 0, 255],
    ])
    const chipSet = new Set(palette.map((c) => c.rgb.join(",")))
    const cells = pseudoCells(6, 9, 42)
    const modes = ["none", "floyd_steinberg"] as const
    const metrics = ["oklab", "ciede2000"] as const
    for (const mode of modes) {
      for (const metric of metrics) {
        const out = mapCellsDithered({
          cells,
          cellsX: 9,
          cellsY: 6,
          palette,
          ditherMode: mode,
          distanceMetric: metric,
        })
        for (let i = 0; i < out.r.length; i += 1) {
          const triple = `${out.r[i]},${out.g[i]},${out.b[i]}`
          expect(chipSet.has(triple), `${mode}/${metric}: leaked ${triple}`).toBe(true)
        }
      }
    }
  })
})
