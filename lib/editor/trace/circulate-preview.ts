/**
 * Client-side render helper for the Circulate preview dialog.
 *
 * Mirrors the server renderer (`filter-service/app/circulate.py`): the cropped
 * source is downsampled to a `cellsX × cellsY` grid (area-average, shared
 * `cellAreaAverages`), each cell snapped to the nearest Munsell chip
 * (`mapCellsToPalette`); the optional inner ellipse uses the adjusted snap
 * (`mapCellsToPaletteAdjusted`, the chosen sub colour filter). One ellipse
 * (or two) is painted per cell at the cell centre, in the target's pixel space.
 *
 * Like the pixelate preview, ONLY the trace output is drawn — the ellipses on a
 * transparent background, no source photo underneath (the applied result's bitmap
 * layer is a separate, toggleable layer). Caller (React) owns the device-resolution
 * `target.width`/`target.height`.
 *
 * Pipeline is exposed as separate stages (mirroring `pixelate-preview.ts`)
 * so React callers can memoize each step against its own subset of params.
 */
import { readSourceCells, type CellColors } from "./pixelate-preview"
import type { DistanceMetric } from "./distance-metric-schema"
import type { DitherMode, DitherStrength } from "./dither-mode-schema"
import type { OklabAdjustment } from "./inner-color-filters"
import type { BlueNoiseLut } from "./knoll-yliluoma"
import { restrictPalettePam } from "./pam-palette-restriction"
import { reduceToTopN } from "./palette-reduction"
import type { PaletteRestriction } from "./palette-restriction-schema"
import {
  mapCellsDithered,
  mapCellsToPaletteAdjusted,
  type PaletteChip,
} from "./trace-cell-colors"

export type CirculateEllipseFractions = {
  outerWFrac: number
  outerHFrac: number
  innerWFrac: number
  innerHFrac: number
}

/**
 * Stage 2a — PR-I PAM restriction for the OUTER palette only. Inner
 * ellipses keep the FULL palette so the sub-colour-filter math can find
 * every chip. Mirrors `circulate.py`.
 */
export function restrictOuterPalette(args: {
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
 * Stage 2b — palette-snap (and optional dither) for the OUTER ellipse
 * colours. Same as the pixelate-preview snap step; `dither_mode ===
 * "texture"` also runs the blue-noise neighbour invasion inside the
 * dispatch.
 */
export function snapAndDitherOuter(args: {
  cellMeans: CellColors
  cellsX: number
  cellsY: number
  palette: ReadonlyArray<PaletteChip>
  preSnapChromaScale?: number
  ditherMode?: DitherMode
  ditherStrength?: DitherStrength | number
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
    blueNoiseLut: textureLut as BlueNoiseLut | null | undefined ?? null,
    distanceMetric: distanceMetric ?? "oklab",
  })
}

/**
 * Stage 4 — post-snap top-N reduction on the OUTER ellipses. Skipped
 * when PAM already restricted the palette pre-snap. Inner ellipses are
 * not capped (decorative).
 */
export function applyTopNReductionOuter(args: {
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
 * Stage 5 — inner-ellipse colours. Snaps the unmodified means against
 * the FULL palette after the sub-colour-filter adjustment (mirrors
 * `circulate.py::_inner_colors`). Returns `null` when the inner ellipse
 * is disabled — callers can skip the paint stage's inner branch.
 */
export function snapInnerCells(args: {
  cellMeans: CellColors
  palette: ReadonlyArray<PaletteChip>
  innerEnabled: boolean
  innerAdjustment: OklabAdjustment
  distanceMetric?: DistanceMetric
}): CellColors | null {
  const { cellMeans, palette, innerEnabled, innerAdjustment, distanceMetric } = args
  if (!innerEnabled) return null
  return mapCellsToPaletteAdjusted(cellMeans, palette, innerAdjustment, distanceMetric ?? "oklab")
}

/**
 * Stage 6 — paint outer/inner ellipses + per-cell frame outlines on a
 * TRANSPARENT background (no source photo — like the pixelate preview, only the
 * trace output). Light: cell-count proportional canvas ops.
 *
 * No paint-by-numbers labels in the preview — the preview's purpose is a
 * quick visual reference for the eventual Apply result, not a paint-by-
 * numbers key. The Apply path still emits the `<g id="numbers">` group
 * in the saved SVG.
 */
export function paintCirculateCells(args: {
  target: HTMLCanvasElement
  cellsX: number
  cellsY: number
  outer: CellColors
  inner: CellColors | null
  ellipseFractions: CirculateEllipseFractions
  contourPx: number
}): void {
  const { target, cellsX, cellsY, outer, inner, ellipseFractions, contourPx } = args
  const ctx = target.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("paintCirculateCells: 2D context unavailable")

  // Transparent background — only the ellipses/frames, like the pixelate preview.
  ctx.clearRect(0, 0, target.width, target.height)

  const cellW = target.width / cellsX
  const cellH = target.height / cellsY
  const outerRx = (ellipseFractions.outerWFrac * cellW) / 2
  const outerRy = (ellipseFractions.outerHFrac * cellH) / 2
  const innerRx = (ellipseFractions.innerWFrac * cellW) / 2
  const innerRy = (ellipseFractions.innerHFrac * cellH) / 2
  if (contourPx > 0) {
    ctx.strokeStyle = "black"
    ctx.lineWidth = contourPx
  }

  const paintEllipse = (cx: number, cy: number, rx: number, ry: number, fill: string) => {
    if (rx <= 0 || ry <= 0) return
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    if (contourPx > 0) ctx.stroke()
  }

  for (let cy = 0; cy < cellsY; cy += 1) {
    const centerY = (cy + 0.5) * cellH
    for (let cx = 0; cx < cellsX; cx += 1) {
      const i = cy * cellsX + cx
      const centerX = (cx + 0.5) * cellW
      paintEllipse(centerX, centerY, outerRx, outerRy, `rgb(${outer.r[i]}, ${outer.g[i]}, ${outer.b[i]})`)
      if (inner) {
        paintEllipse(centerX, centerY, innerRx, innerRy, `rgb(${inner.r[i]}, ${inner.g[i]}, ${inner.b[i]})`)
      }
    }
  }

  // Per-cell frame outline — mirrors the server's `<g id="frames">`.
  // Always on, independent of the user-configured contour width. Sits
  // on top of the colour ellipses so it remains visible regardless of
  // chip darkness. Without this the preview drifts visually from the
  // applied trace once cells are toggled off.
  ctx.strokeStyle = "black"
  ctx.lineWidth = 1
  for (let cy = 0; cy < cellsY; cy += 1) {
    const centerY = (cy + 0.5) * cellH
    for (let cx = 0; cx < cellsX; cx += 1) {
      const centerX = (cx + 0.5) * cellW
      ctx.beginPath()
      ctx.ellipse(centerX, centerY, outerRx, outerRy, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
}

