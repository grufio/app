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
import { computeCellLabels, paintCellLabels } from "./cell-labels"
import { applyNeighborInvasion } from "./cell-texture"
import type { OklabAdjustment } from "./inner-color-filters"
import { cellAreaAverages, mapCellsToPalette, mapCellsToPaletteAdjusted, type PaletteChip } from "./trace-cell-colors"

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
  /** Blue-noise texture on the outer ellipses (mirror of `circulate.py`).
   * Inner ellipses keep their derived sub-colour either way. Skipped when
   * disabled, strength 0, LUT still loading, or no palette. */
  textureEnabled?: boolean
  textureStrength?: number
  textureLut?: Uint8Array | null
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
    textureEnabled,
    textureStrength,
    textureLut,
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

  // (2) Per-cell area-average, then palette snap (outer) + hue-shifted snap
  // (inner) — mirrors the server.
  const means = cellAreaAverages({ rgba: cropData, width: cropW, height: cropH, cellsX, cellsY })
  let outer = mapCellsToPalette(means, palette)
  // (2b) Blue-noise texture on the OUTER cells only (matches `circulate.py`).
  // Inner ellipses are computed from the original means below, so they keep
  // the sub-colour-filter relationship to the underlying cell.
  if (textureEnabled && textureStrength && textureStrength > 0 && textureLut && palette.length > 0) {
    outer = applyNeighborInvasion({
      cells: outer,
      palette: palette.map((c) => c.rgb),
      cellsY,
      cellsX,
      strength: textureStrength,
      blueNoiseLut: textureLut,
    })
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

  // Paint-by-numbers labels on top of the outer ellipses. Same per-image
  // sorted-unique mapping as the server's `<g id="numbers">`; skipped
  // silently if the palette hasn't loaded.
  const labelled = computeCellLabels({ cells: outer, cellsX, cellsY, palette })
  if (labelled) {
    paintCellLabels({
      ctx,
      labels: labelled.labels,
      cellsX,
      cellsY,
      pxPerCellX: cellW,
      pxPerCellY: cellH,
    })
  }
}
