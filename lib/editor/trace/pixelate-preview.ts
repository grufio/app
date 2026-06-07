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
import { applyNeighborInvasion } from "./cell-texture"
import type { DistanceMetric } from "./distance-metric-schema"
import type { DitherMode, DitherPatternSize } from "./dither-mode-schema"
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
 * Stage 2b — palette-snap (and optional KY/FS dither). Mirrors the
 * server's `map_cells_dithered`. `dither_mode="none"` (default) collapses
 * to plain `mapCellsToPalette`, byte-identical to the pre-PR-F preview.
 * An empty palette (still loading) returns the raw means as graceful
 * fallback.
 */
export function snapAndDitherCells(args: {
  cellMeans: CellColors
  cellsX: number
  cellsY: number
  palette: ReadonlyArray<PaletteChip>
  preSnapChromaScale?: number
  ditherMode?: DitherMode
  ditherPatternSize?: DitherPatternSize | number
  distanceMetric?: DistanceMetric
  textureLut?: Uint8Array | null
}): CellColors {
  const {
    cellMeans,
    cellsX,
    cellsY,
    palette,
    preSnapChromaScale,
    ditherMode,
    ditherPatternSize,
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
    ditherPatternSize: ditherPatternSize ?? 4,
    // KY needs the LUT — reuse the same one the texture step uses. FS
    // doesn't need it (sequential error diffusion); the dispatch only
    // gates KY on LUT availability.
    blueNoiseLut: textureLut as BlueNoiseLut | null | undefined ?? null,
    distanceMetric: distanceMetric ?? "oklab",
  })
}

/**
 * Stage 3 — optional blue-noise neighbour-invasion texture. Skipped when
 * dithering is on (the dither output already provides spatial quantization
 * — stacking both would double-dither). Mirrors the server-side branch in
 * `pixelate.py` so the preview and the applied SVG agree byte-for-byte
 * when both inputs match.
 */
export function applyTextureStep(args: {
  cells: CellColors
  cellsX: number
  cellsY: number
  palette: ReadonlyArray<PaletteChip>
  textureEnabled?: boolean
  textureStrength?: number
  textureLut?: Uint8Array | null
  ditherMode?: DitherMode
}): CellColors {
  const { cells, cellsX, cellsY, palette, textureEnabled, textureStrength, textureLut, ditherMode } = args
  if (
    (ditherMode ?? "none") !== "none" ||
    !textureEnabled ||
    !textureStrength ||
    textureStrength <= 0 ||
    !textureLut ||
    palette.length === 0
  ) {
    return cells
  }
  return applyNeighborInvasion({
    cells,
    palette: palette.map((c) => c.rgb),
    cellsY,
    cellsX,
    strength: textureStrength,
    blueNoiseLut: textureLut,
  })
}

/**
 * Stage 4 — post-snap top-N reduction (mirror of `reduce_to_top_n` in the
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

/**
 * Stage 5 — paint the resolved cells onto the visible target canvas plus
 * per-cell frame outlines. Light: cell-count proportional canvas ops.
 *
 * No paint-by-numbers labels in the preview — the preview's purpose is a
 * quick visual reference for "what will this look like after apply",
 * not a paint-by-numbers key. The Apply path still emits the
 * `<g id="numbers">` group in the saved SVG.
 */
export function paintCellsToCanvas(args: {
  target: HTMLCanvasElement
  cells: CellColors
  cellsX: number
  cellsY: number
}): void {
  const { target, cells, cellsX, cellsY } = args
  const ctx = target.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("paintCellsToCanvas: 2D context unavailable")
  const { r, g, b } = cells
  ctx.imageSmoothingEnabled = false
  const cellW = target.width / cellsX
  const cellH = target.height / cellsY
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const i = cy * cellsX + cx
      ctx.fillStyle = `rgb(${r[i]}, ${g[i]}, ${b[i]})`
      // +1 px overdraw to avoid sub-pixel seams between adjacent cells.
      ctx.fillRect(
        Math.floor(cx * cellW),
        Math.floor(cy * cellH),
        Math.ceil(cellW) + 1,
        Math.ceil(cellH) + 1,
      )
    }
  }
  // Per-cell frame outline. Mirrors the server's `<g id="grid">` — always
  // on, never toggled. Without this the preview shows raw colour blocks;
  // the applied trace would surprise users with grid lines they didn't
  // see in the dialog.
  ctx.strokeStyle = "black"
  ctx.lineWidth = 1
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      ctx.strokeRect(cx * cellW, cy * cellH, cellW, cellH)
    }
  }
}
