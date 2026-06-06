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
 * The cropped source is drawn first as the background (matching the editor's
 * real composite: the bitmap layer under the SVG overlay; the user can hide
 * that layer later), then the ellipses on top. Caller (React) owns
 * `target.width`/`target.height` (= crop pixels), like the pixelate preview.
 */
import { applyNeighborInvasion } from "./cell-texture"
import type { DitherMode, DitherPatternSize } from "./dither-mode-schema"
import type { OklabAdjustment } from "./inner-color-filters"
import type { BlueNoiseLut } from "./knoll-yliluoma"
import { reduceToTopN } from "./palette-reduction"
import {
  cellAreaAverages,
  mapCellsDithered,
  mapCellsToPaletteAdjusted,
  type PaletteChip,
} from "./trace-cell-colors"

export function buildCirculateMiniCanvas(args: {
  target: HTMLCanvasElement
  source: CanvasImageSource
  crop: { x: number; y: number; w: number; h: number }
  cellsX: number
  cellsY: number
  /** Outer ellipse axes as a fraction of the cell (0..1). */
  outerWFrac: number
  outerHFrac: number
  innerEnabled: boolean
  innerWFrac: number
  innerHFrac: number
  /** Contour stroke width in target pixels (0 = no contour). */
  contourPx: number
  /** OKLab adjustment for the inner ellipse (the resolved sub colour filter). */
  innerAdjustment: OklabAdjustment
  /** Munsell palette to snap cells to; empty while it loads → raw means. */
  palette: ReadonlyArray<PaletteChip>
  /** Pre-snap OKLCh chroma multiplier (mirrors server `pre_snap_chroma_scale`).
   * Applies to the OUTER ellipses only — inner keeps its derived sub-colour
   * math. Default `1.0` = no boost. */
  preSnapChromaScale?: number
  /** Cap on distinct chip count in the rendered preview (mirrors server's
   * `num_colors` top-N reduction). Applied to outer ellipses post-snap +
   * post-texture so preview matches the Python apply. */
  numColors?: number | null
  /** Blue-noise texture on the outer ellipses (mirror of `circulate.py`).
   * Inner ellipses keep their derived sub-colour either way. Skipped when
   * disabled, strength 0, LUT still loading, or no palette. */
  textureEnabled?: boolean
  textureStrength?: number
  textureLut?: Uint8Array | null
  /** Dithering at the snap step (PR-F). Applies to OUTER ellipses only;
   * inner ellipses keep their sub-colour-filter math (computed from the
   * pre-snap means). `"none"` (default) preserves byte-identical
   * pre-PR-F preview output. */
  ditherMode?: DitherMode
  ditherPatternSize?: DitherPatternSize | number
}): void {
  const {
    target,
    source,
    crop,
    cellsX,
    cellsY,
    outerWFrac,
    outerHFrac,
    innerEnabled,
    innerWFrac,
    innerHFrac,
    contourPx,
    innerAdjustment,
    palette,
    preSnapChromaScale,
    numColors,
    textureEnabled,
    textureStrength,
    textureLut,
    ditherMode,
    ditherPatternSize,
  } = args
  const ctx = target.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("buildCirculateMiniCanvas: 2D context unavailable")

  // (1) Copy the cropped source region into a work canvas at FULL crop
  // resolution so every source pixel feeds the per-cell average.
  const cropW = Math.max(1, Math.round(crop.w))
  const cropH = Math.max(1, Math.round(crop.h))
  const work = document.createElement("canvas")
  work.width = cropW
  work.height = cropH
  const wctx = work.getContext("2d", { willReadFrequently: true })
  if (!wctx) throw new Error("buildCirculateMiniCanvas: work 2D context unavailable")
  wctx.imageSmoothingEnabled = false
  wctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, cropW, cropH)
  const cropData = wctx.getImageData(0, 0, cropW, cropH).data

  // (2) Per-cell area-average, then snap-or-dither (outer) + hue-shifted snap
  // (inner) — mirrors the server. `preSnapChromaScale` applies to OUTER only;
  // inner keeps its sub-colour-filter math (`mapCellsToPaletteAdjusted`).
  // `mapCellsDithered` with `dither_mode="none"` (default) falls through to
  // the plain snap, byte-identical to the pre-PR-F preview.
  const means = cellAreaAverages({ rgba: cropData, width: cropW, height: cropH, cellsX, cellsY })
  let outer = mapCellsDithered({
    cells: means,
    cellsX,
    cellsY,
    palette,
    preSnapChromaScale: preSnapChromaScale ?? 1.0,
    ditherMode: ditherMode ?? "none",
    ditherPatternSize: ditherPatternSize ?? 4,
    blueNoiseLut: textureLut as BlueNoiseLut | null | undefined ?? null,
  })
  // (2b) Blue-noise texture on the OUTER cells only. Skipped when dithering
  // is on (the dither output already provides spatial quantization —
  // stacking both would double-dither). Inner ellipses are computed from
  // the original means below regardless of texture/dither, so they keep
  // the sub-colour-filter relationship to the underlying cell.
  if (
    (ditherMode ?? "none") === "none" &&
    textureEnabled &&
    textureStrength &&
    textureStrength > 0 &&
    textureLut &&
    palette.length > 0
  ) {
    outer = applyNeighborInvasion({
      cells: outer,
      palette: palette.map((c) => c.rgb),
      cellsY,
      cellsX,
      strength: textureStrength,
      blueNoiseLut: textureLut,
    })
  }
  // (2c) Top-N reduction on the OUTER ellipses — mirrors `reduce_to_top_n` in
  // the Python pipeline. Inner ellipses are not capped (decorative).
  if (palette.length > 0 && numColors != null && numColors > 0) {
    outer = reduceToTopN(outer, palette, numColors).cells
  }
  const inner = innerEnabled ? mapCellsToPaletteAdjusted(means, palette, innerAdjustment) : null

  // (3) Background = the cropped source, scaled into the target (the bitmap
  // layer the ellipses overlay). Then paint the ellipses on top.
  ctx.clearRect(0, 0, target.width, target.height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, target.width, target.height)

  const cellW = target.width / cellsX
  const cellH = target.height / cellsY
  const outerRx = (outerWFrac * cellW) / 2
  const outerRy = (outerHFrac * cellH) / 2
  const innerRx = (innerWFrac * cellW) / 2
  const innerRy = (innerHFrac * cellH) / 2
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

  // No paint-by-numbers labels in the preview — the preview's purpose
  // is a quick visual reference for the eventual Apply result, not a
  // paint-by-numbers key. The Apply path still emits the
  // `<g id="numbers">` group in the saved SVG.
}
