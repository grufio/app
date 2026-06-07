/**
 * Shared client-side color detection for trace previews.
 *
 * The single place where a trace preview turns source pixels into per-cell
 * colours — used by Pixelate and (soon) Circulate and any future trace, so a
 * change to the colour model is made in ONE spot. The server mirror is
 * `filter-service/app/cell_colors.py`; they must stay in lockstep (the
 * authoritative SVG comes from the server, this only drives the live preview).
 *
 * Today: a true per-cell area-average (`cellAreaAverages`), geometrically
 * equivalent to the server's `Image.BOX` downsample, then `mapCellsToPalette`
 * snaps each cell to the nearest Munsell chip via OKLab — mirroring the
 * server (`filter-service/app/cell_colors.py`).
 */
import {
  nearestPaletteIndexCiede2000,
  rgb255ToCielab,
  type CieLab,
} from "@/lib/color/ciede2000"
import { adjustOklab, nearestPaletteIndex, rgb255ToOklab, type Oklab } from "@/lib/color/oklab"
import type { DistanceMetric } from "./distance-metric-schema"
import type { DitherMode, DitherPatternSize } from "./dither-mode-schema"
import { floydSteinbergDither } from "./floyd-steinberg"
import type { OklabAdjustment } from "./inner-color-filters"
import {
  candidatesSortedByAxis,
  knollYliluomaCandidates,
  thresholdBin,
  type BlueNoiseLut,
} from "./knoll-yliluoma"

/**
 * Pure per-cell area-average. Given a flat pixel buffer (`width × height`,
 * row-major, `bytesPerPixel` bytes per pixel — 4 for RGBA, 3 for RGB), it
 * partitions the buffer into a `cellsX × cellsY` grid and returns the mean
 * R/G/B of every source pixel in each cell, row-major (`cy * cellsX + cx`).
 *
 * Each source pixel is assigned to exactly one cell via
 * `floor(p * cells / size)`, so every pixel contributes to precisely
 * one cell and all pixels in a cell are averaged — a genuine
 * area-average aligned to the cell grid (geometrically equivalent to
 * the server's `Image.BOX`). Canvas-free, so it is unit-testable
 * without a DOM.
 *
 * Default `bytesPerPixel: 4` matches the canvas `getImageData()` shape that
 * client previews pass in; a Vercel server caller using `sharp(...).raw()` on
 * an alpha-stripped image passes `bytesPerPixel: 3`.
 */
export function cellAreaAverages(args: {
  rgba: Uint8ClampedArray | Uint8Array
  width: number
  height: number
  cellsX: number
  cellsY: number
  bytesPerPixel?: 3 | 4
}): { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray } {
  const { rgba, width, height, cellsX, cellsY } = args
  const bpp = args.bytesPerPixel ?? 4
  const cellCount = cellsX * cellsY
  const sumR = new Float64Array(cellCount)
  const sumG = new Float64Array(cellCount)
  const sumB = new Float64Array(cellCount)
  const count = new Uint32Array(cellCount)

  for (let py = 0; py < height; py += 1) {
    const cy = Math.min(cellsY - 1, Math.floor((py * cellsY) / height))
    const cellRow = cy * cellsX
    const rowBase = py * width * bpp
    for (let px = 0; px < width; px += 1) {
      const cx = Math.min(cellsX - 1, Math.floor((px * cellsX) / width))
      const ci = cellRow + cx
      const o = rowBase + px * bpp
      sumR[ci] += rgba[o]
      sumG[ci] += rgba[o + 1]
      sumB[ci] += rgba[o + 2]
      count[ci] += 1
    }
  }

  const r = new Uint8ClampedArray(cellCount)
  const g = new Uint8ClampedArray(cellCount)
  const b = new Uint8ClampedArray(cellCount)
  for (let i = 0; i < cellCount; i += 1) {
    const n = count[i] || 1
    r[i] = Math.round(sumR[i] / n)
    g[i] = Math.round(sumG[i] / n)
    b[i] = Math.round(sumB[i] / n)
  }
  return { r, g, b }
}

/** One palette chip: OKLab (for matching) + RGB (the emitted colour) +
 * the chip's Munsell notation and ISCC-NBS Level-3 name for display.
 * Mirrors the `/api/palette` response and the server
 * `lib/supabase/palette.ts` shape. */
export type PaletteChip = {
  oklab: Oklab
  rgb: readonly [number, number, number]
  notation: string
  iscc_nbs_name: string | null
}

export type CellColors = { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray }

/**
 * Snap each per-cell mean to the nearest palette chip, mirroring the
 * server's `map_cells_to_palette`. Returns new channel arrays; an
 * empty palette returns the input unchanged (raw means).
 *
 * `preSnapChromaScale` (default `1.0` = no-op) multiplies each cell mean's
 * OKLCh chroma BEFORE the nearest-chip argmin. Mirrors the Python
 * `map_cells_to_palette(..., pre_snap_chroma_scale=k)` and uses the same
 * `adjustOklab` math (parity-tested in `lib/color/oklab.test.ts`).
 * Honoured only on the `"oklab"` metric path; the `"ciede2000"` path
 * skips the boost (OKLCh ≠ CIE LCh — see `distance-metric-schema.ts`).
 *
 * `distanceMetric` (PR-H, default `"oklab"`) picks the snap metric:
 *   - `"oklab"`     → OKLab squared-Euclidean argmin (pre-PR-H semantics)
 *   - `"ciede2000"` → CIE Lab D65 + ΔE00 via `nearestPaletteIndexCiede2000`
 *
 * Palette CIE Lab vectors are computed once up-front from each chip's
 * RGB (~300 chips per request, sub-millisecond).
 */
export function mapCellsToPalette(
  cells: CellColors,
  palette: ReadonlyArray<PaletteChip>,
  preSnapChromaScale: number = 1.0,
  distanceMetric: DistanceMetric = "oklab",
): CellColors {
  if (palette.length === 0) return cells
  const n = cells.r.length
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)

  if (distanceMetric === "ciede2000") {
    const paletteLab: CieLab[] = palette.map((c) =>
      rgb255ToCielab(c.rgb[0], c.rgb[1], c.rgb[2]),
    )
    for (let i = 0; i < n; i += 1) {
      const lab = rgb255ToCielab(cells.r[i], cells.g[i], cells.b[i])
      const idx = nearestPaletteIndexCiede2000(lab, paletteLab)
      const chip = palette[idx].rgb
      r[i] = chip[0]
      g[i] = chip[1]
      b[i] = chip[2]
    }
    return { r, g, b }
  }

  // "oklab" — the pre-PR-H path. Boost applies only here.
  const paletteOklab = palette.map((c) => c.oklab)
  const boost = preSnapChromaScale !== 1.0
  for (let i = 0; i < n; i += 1) {
    let oklab = rgb255ToOklab(cells.r[i], cells.g[i], cells.b[i])
    if (boost) {
      oklab = adjustOklab(oklab, { hueDeg: 0, lightnessDelta: 0, chromaScale: preSnapChromaScale })
    }
    const idx = nearestPaletteIndex(oklab, paletteOklab)
    const chip = palette[idx].rgb
    r[i] = chip[0]
    g[i] = chip[1]
    b[i] = chip[2]
  }
  return { r, g, b }
}

/**
 * Snap-or-dither dispatch shared by pixelate + circulate previews
 * (PR-F). Mirror of the server's `map_cells_dithered`
 * (`filter-service/app/cell_colors.py`); same dispatch tree:
 *
 *   - `dither_mode === "none"`            → falls through to
 *                                            `mapCellsToPalette`
 *                                            (byte-identical to the
 *                                            pre-PR-F preview).
 *   - `dither_mode === "knoll_yliluoma"`  → per-cell candidate
 *                                            selection + lightness
 *                                            sort + blue-noise
 *                                            threshold pick.
 *   - `dither_mode === "floyd_steinberg"` → scan-order error
 *                                            diffusion.
 *
 * Shape (`cellsX` / `cellsY`) is required because KY needs cell coords
 * for the blue-noise threshold lookup and FS walks rows + cols in
 * scan order. The plain {@link mapCellsToPalette} is shape-free
 * because the snap is position-independent.
 *
 * KY also needs the blue-noise LUT (caller-loaded via
 * `loadBlueNoiseLut()`); without it KY falls back to the snap path so
 * the preview stays usable while the LUT is fetching.
 *
 * An empty palette returns the input unchanged for every mode.
 */
export function mapCellsDithered(args: {
  cells: CellColors
  cellsX: number
  cellsY: number
  palette: ReadonlyArray<PaletteChip>
  preSnapChromaScale?: number
  ditherMode?: DitherMode
  ditherPatternSize?: DitherPatternSize | number
  blueNoiseLut?: BlueNoiseLut | null
  /** Snap-step distance metric (PR-H, default `"oklab"`). Honoured only
   * on the `"none"` dither path; KY + FS keep squared-Euclidean argmin
   * in OKLab regardless. */
  distanceMetric?: DistanceMetric
}): CellColors {
  const {
    cells,
    cellsX,
    cellsY,
    palette,
    preSnapChromaScale = 1.0,
    ditherMode = "none",
    ditherPatternSize = 4,
    blueNoiseLut = null,
    distanceMetric = "oklab",
  } = args
  if (palette.length === 0) return cells
  const lutAvailable = blueNoiseLut != null
  if (ditherMode === "none" || (ditherMode === "knoll_yliluoma" && !lutAvailable)) {
    return mapCellsToPalette(cells, palette, preSnapChromaScale, distanceMetric)
  }

  const n = cells.r.length
  if (n !== cellsX * cellsY) {
    throw new Error(
      `mapCellsDithered: cells length ${n} != cellsX*cellsY = ${cellsX * cellsY}`,
    )
  }

  // Build the cell-mean OKLab array (with optional pre-snap chroma boost),
  // flattened row-major `cellsOklab[i*3 + d]` matching the algorithm helpers.
  const cellsOklab = new Float64Array(n * 3)
  const boost = preSnapChromaScale !== 1.0
  for (let i = 0; i < n; i += 1) {
    let lab = rgb255ToOklab(cells.r[i], cells.g[i], cells.b[i])
    if (boost) {
      lab = adjustOklab(lab, { hueDeg: 0, lightnessDelta: 0, chromaScale: preSnapChromaScale })
    }
    cellsOklab[i * 3] = lab[0]
    cellsOklab[i * 3 + 1] = lab[1]
    cellsOklab[i * 3 + 2] = lab[2]
  }

  // Flat palette OKLab + RGB rows for the algorithm helpers.
  const M = palette.length
  const paletteOklabFlat = new Float64Array(M * 3)
  for (let i = 0; i < M; i += 1) {
    const lab = palette[i].oklab
    paletteOklabFlat[i * 3] = lab[0]
    paletteOklabFlat[i * 3 + 1] = lab[1]
    paletteOklabFlat[i * 3 + 2] = lab[2]
  }

  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)

  if (ditherMode === "knoll_yliluoma") {
    // We've already validated `lutAvailable` above when we didn't return
    // early — so `blueNoiseLut` is non-null here.
    const lut = blueNoiseLut as BlueNoiseLut
    const patternSize = Math.max(1, Math.floor(ditherPatternSize))
    for (let y = 0; y < cellsY; y += 1) {
      for (let x = 0; x < cellsX; x += 1) {
        const ci = y * cellsX + x
        const target = [cellsOklab[ci * 3], cellsOklab[ci * 3 + 1], cellsOklab[ci * 3 + 2]]
        const candidates = knollYliluomaCandidates(target, paletteOklabFlat, M, 3, patternSize)
        const sorted = candidatesSortedByAxis(candidates, paletteOklabFlat, 3, 0)
        const bin = thresholdBin(x, y, patternSize, lut)
        const chip = palette[sorted[bin]].rgb
        r[ci] = chip[0]
        g[ci] = chip[1]
        b[ci] = chip[2]
      }
    }
  } else {
    // floyd_steinberg
    const indices = floydSteinbergDither(cellsOklab, cellsY, cellsX, paletteOklabFlat, M, 3)
    for (let i = 0; i < n; i += 1) {
      const chip = palette[indices[i]].rgb
      r[i] = chip[0]
      g[i] = chip[1]
      b[i] = chip[2]
    }
  }
  return { r, g, b }
}

/**
 * Like {@link mapCellsToPalette} but applies an OKLab `adjustment` (the chosen
 * inner-colour sub filter) to each cell mean before snapping to the nearest
 * chip — Circulate's inner-ellipse colour. Mirror of the server's
 * `_inner_colors` (`filter-service/app/circulate.py`); the adjusted colour
 * stays in the palette. The identity adjustment reduces to
 * {@link mapCellsToPalette}. An empty palette returns the input unchanged.
 *
 * The sub-colour-filter math is OKLCh-defined, so the adjustment ALWAYS
 * happens in OKLab regardless of `distanceMetric` (PR-H). Only the
 * final snap-to-chip step honours the metric: `"oklab"` keeps the
 * pre-PR-H squared-Euclidean argmin; `"ciede2000"` re-snaps via CIE
 * Lab D65 + ΔE00 (same round-trip-through-anchor-chip strategy as the
 * Python `_inner_colors`).
 */
export function mapCellsToPaletteAdjusted(
  cells: CellColors,
  palette: ReadonlyArray<PaletteChip>,
  adjustment: OklabAdjustment,
  distanceMetric: DistanceMetric = "oklab",
): CellColors {
  if (palette.length === 0) return cells
  const paletteOklab = palette.map((c) => c.oklab)
  const n = cells.r.length
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)

  if (distanceMetric === "ciede2000") {
    const paletteLab: CieLab[] = palette.map((c) =>
      rgb255ToCielab(c.rgb[0], c.rgb[1], c.rgb[2]),
    )
    for (let i = 0; i < n; i += 1) {
      // OKLab adjustment → anchor chip via OKLab snap → re-snap anchor RGB
      // in CIE Lab. Mirror of the Python helper's round-trip in
      // `circulate.py::_inner_colors`.
      const adjusted = adjustOklab(rgb255ToOklab(cells.r[i], cells.g[i], cells.b[i]), adjustment)
      const anchorIdx = nearestPaletteIndex(adjusted, paletteOklab)
      const anchor = palette[anchorIdx].rgb
      const anchorLab = rgb255ToCielab(anchor[0], anchor[1], anchor[2])
      const chip = palette[nearestPaletteIndexCiede2000(anchorLab, paletteLab)].rgb
      r[i] = chip[0]
      g[i] = chip[1]
      b[i] = chip[2]
    }
    return { r, g, b }
  }

  for (let i = 0; i < n; i += 1) {
    const adjusted = adjustOklab(rgb255ToOklab(cells.r[i], cells.g[i], cells.b[i]), adjustment)
    const chip = palette[nearestPaletteIndex(adjusted, paletteOklab)].rgb
    r[i] = chip[0]
    g[i] = chip[1]
    b[i] = chip[2]
  }
  return { r, g, b }
}
