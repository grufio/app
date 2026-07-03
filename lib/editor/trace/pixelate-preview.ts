/**
 * Client-side render helper for the Pixelate preview dialog.
 *
 * The output canvas is sized at the **source crop resolution**
 * (crop.w × crop.h source pixels), NOT at cellsX × cellsY. Each cell
 * is then painted as a solid-colour `fillRect` over its source-pixel
 * area. Effect: the displayed bitmap has full source resolution, the
 * browser doesn't have to upscale a tiny 16 × 11 bitmap to fit the
 * pane (which on some browsers/zoom-levels produced fuzzy edges
 * despite `image-rendering: pixelated`).
 *
 * Per-cell colours are computed as a **true area-average** over every
 * source pixel that falls into the cell — `cellAreaAverages` (now in the
 * shared `trace-cell-colors.ts`) — mirroring the server's `Image.BOX`
 * downsample (`filter-service/app/cell_colors.py`). The previous
 * implementation did a single `drawImage(source → cellsX×cellsY)`, which
 * for large reduction ratios samples only a tiny neighbourhood per cell
 * instead of averaging the whole block; that produced the noisy, "too low
 * resolution" cell colours and diverged from the actual trace output.
 *
 * Pipeline is exposed as a five-stage chain so React callers can
 * memoize each step against its own subset of params: `readSourceCells`
 * (the heavy per-source-pixel area-average) only re-runs when the
 * source / crop / grid change, while `paintCellsToCanvas` re-runs on
 * every cells / palette update.
 *
 * Caller (React) owns `target.width` / `target.height` via JSX props
 * set to `crop.w` / `crop.h`.
 */
import type { DistanceMetric } from "./distance-metric-schema"
import type { DitherMode, DitherStrength } from "./dither-mode-schema"
import type { BlueNoiseLut } from "./knoll-yliluoma"
import { restrictPalettePam } from "./pam-palette-restriction"
import { reduceToTopN } from "./palette-reduction"
import type { PaletteRestriction } from "./palette-restriction-schema"
import {
  cellAreaAverages,
  mapCellsDithered,
  type PaletteChip,
} from "./trace-cell-colors"

export type CellColors = {
  r: Uint8ClampedArray
  g: Uint8ClampedArray
  b: Uint8ClampedArray
}

/**
 * Stage 1 — read the cropped source and compute the per-cell area-average.
 *
 * Heavy: iterates over every source pixel in the crop (`cropW * cropH`),
 * so callers that re-render on unrelated param changes (palette / dither
 * / texture) should memoize this against `(source, crop, cellsX, cellsY)`
 * to skip the work.
 */
export function readSourceCells(args: {
  source: CanvasImageSource
  crop: { x: number; y: number; w: number; h: number }
  cellsX: number
  cellsY: number
}): CellColors {
  const { source, crop, cellsX, cellsY } = args
  const cropW = Math.max(1, Math.round(crop.w))
  const cropH = Math.max(1, Math.round(crop.h))
  const work = document.createElement("canvas")
  work.width = cropW
  work.height = cropH
  const wctx = work.getContext("2d", { willReadFrequently: true })
  if (!wctx) throw new Error("readSourceCells: work 2D context unavailable")
  wctx.imageSmoothingEnabled = false
  wctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, cropW, cropH)
  const cropData = wctx.getImageData(0, 0, cropW, cropH).data
  return cellAreaAverages({ rgba: cropData, width: cropW, height: cropH, cellsX, cellsY })
}

/**
 * Stage 2a — PR-I palette restriction. When `paletteRestriction === "pam"`,
 * pre-shrink the palette to `numColors` medoid chips against the means.
 * Otherwise the input palette is returned unchanged. The returned palette is
 * what {@link snapAndDitherCells} and the rest of the pipeline must snap to.
 */
export function restrictPaletteForCells(args: {
  cellMeans: CellColors
  palette: ReadonlyArray<PaletteChip>
  numColors?: number | null
  distanceMetric?: DistanceMetric
  paletteRestriction?: PaletteRestriction
}): ReadonlyArray<PaletteChip> {
  const { cellMeans, palette, numColors, distanceMetric, paletteRestriction } = args
  if ((paletteRestriction ?? "top_n") !== "pam") return palette
  if (palette.length === 0 || numColors == null) return palette
  return restrictPalettePam({
    cells: cellMeans,
    palette,
    numColors,
    distanceMetric: distanceMetric ?? "oklab",
  }).palette
}

/**
 * Stage 2b — palette-snap with optional dithering. Mirrors the server's
 * `map_cells_dithered` (cell_colors.py). All dither modes including
 * `"texture"` are handled inside `mapCellsDithered`; the separate
 * texture step is gone post-unification.
 *
 * `dither_mode="none"` collapses to plain `mapCellsToPalette`. An empty
 * palette (still loading) returns the raw means as graceful fallback.
 */
export function snapAndDitherCells(args: {
  cellMeans: CellColors
  cellsX: number
  cellsY: number
  palette: ReadonlyArray<PaletteChip>
  preSnapChromaScale?: number
  ditherMode?: DitherMode
  ditherStrength?: DitherStrength | number
  distanceMetric?: DistanceMetric
  /** Blue-noise LUT, needed by KY and Texture modes. None and FS ignore. */
  textureLut?: Uint8Array | null
}): CellColors {
  const {
    cellMeans,
    cellsX,
    cellsY,
    palette,
    preSnapChromaScale,
    ditherMode,
    ditherStrength,
    distanceMetric,
    textureLut,
  } = args
  return mapCellsDithered({
    cells: cellMeans,
    cellsX,
    cellsY,
    palette,
    preSnapChromaScale: preSnapChromaScale ?? 1.0,
    ditherMode: ditherMode ?? "none",
    ditherStrength: ditherStrength ?? 0.5,
    // KY + Texture need the LUT; FS + None ignore it. The dispatch
    // inside `mapCellsDithered` gates LUT availability.
    blueNoiseLut: textureLut as BlueNoiseLut | null | undefined ?? null,
    distanceMetric: distanceMetric ?? "oklab",
  })
}

/**
 * Stage 3 — post-snap top-N reduction (mirror of `reduce_to_top_n` in the
 * Python pipeline). Skipped when no palette is loaded, `numColors` is
 * null/<=0, OR when PAM already restricted the palette pre-snap.
 */
export function applyTopNReduction(args: {
  cells: CellColors
  palette: ReadonlyArray<PaletteChip>
  numColors?: number | null
  distanceMetric?: DistanceMetric
  paletteRestriction?: PaletteRestriction
}): CellColors {
  const { cells, palette, numColors, distanceMetric, paletteRestriction } = args
  if ((paletteRestriction ?? "top_n") === "pam") return cells
  if (palette.length === 0 || numColors == null || numColors <= 0) return cells
  return reduceToTopN(cells, palette, numColors, distanceMetric ?? "oklab").cells
}

function toHex2(n: number): string {
  return (n & 0xff).toString(16).padStart(2, "0")
}

/**
 * Stage 5 — build the pixelate preview as ONE inline SVG string: a `<rect>` per
 * cell (its snapped colour) PLUS the grid, in a single cell-unit coordinate
 * space (`viewBox="0 0 cellsX cellsY"`, each cell 1×1). Because cells and grid
 * share that space, the grid lines sit EXACTLY on the cell boundaries — no
 * bitmap/overlay rounding, no drift. Mirrors the applied trace's
 * `<g id="colors">` + `<g id="grid">` structure so preview == result.
 *
 * Consumed via `dangerouslySetInnerHTML` (like the applied trace overlay);
 * `preserveAspectRatio="none"` stretches it to the display box. The grid is a
 * razor-sharp non-scaling ~1px hairline (`vector-effect="non-scaling-stroke"` is
 * essential — without it `stroke-width="1"` would be a whole cell wide — plus
 * `shape-rendering="crispEdges"`). The colour rects carry NO `shape-rendering`:
 * 1:1 with the result, and `crispEdges` on adjacent rects risks hairline seams.
 *
 * No paint-by-numbers labels in the preview — quick visual reference only; the
 * apply path still emits the `<g id="numbers">` group in the saved SVG.
 */
export function buildPixelateCellsSvg(args: {
  cells: CellColors
  cellsX: number
  cellsY: number
}): string {
  const { cells, cellsX, cellsY } = args
  const { r, g, b } = cells
  const rects: string[] = []
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const i = cy * cellsX + cx
      rects.push(
        `<rect x="${cx}" y="${cy}" width="1" height="1" fill="#${toHex2(r[i])}${toHex2(g[i])}${toHex2(b[i])}"/>`,
      )
    }
  }
  let d = ""
  for (let i = 0; i <= cellsX; i += 1) d += `M${i} 0V${cellsY}`
  for (let j = 0; j <= cellsY; j += 1) d += `M0 ${j}H${cellsX}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" ` +
    `viewBox="0 0 ${cellsX} ${cellsY}" preserveAspectRatio="none">` +
    `<g>${rects.join("")}</g>` +
    `<path d="${d}" fill="none" stroke="black" stroke-width="1" ` +
    `vector-effect="non-scaling-stroke" shape-rendering="crispEdges"/>` +
    `</svg>`
  )
}
