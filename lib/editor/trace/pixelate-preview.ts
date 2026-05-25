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
 * Colour model unchanged: the optional median-cut quantise to
 * `num_colors` still runs on top of the cell means. Colour parity with
 * the server (which currently emits raw means, ignoring `num_colors`)
 * is a separate, deferred concern.
 *
 * Caller (React) owns `target.width` / `target.height` via JSX props
 * set to `crop.w` / `crop.h`.
 */
import quantize from "quantize"
import type { RgbPixel } from "quantize"

import { cellAreaAverages } from "./trace-cell-colors"

export function buildMiniCanvas(args: {
  target: HTMLCanvasElement
  source: CanvasImageSource
  crop: { x: number; y: number; w: number; h: number }
  cellsX: number
  cellsY: number
  numColors: number
}): void {
  const { target, source, crop, cellsX, cellsY, numColors } = args
  const ctx = target.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("buildMiniCanvas: 2D context unavailable")

  // (1) Copy the cropped source region into a work canvas at FULL crop
  // resolution (no smoothing — a 1:1 blit), then read it back so every
  // source pixel feeds the per-cell average. No reduction happens in
  // drawImage, so the browser can't throw away detail here.
  const cropW = Math.max(1, Math.round(crop.w))
  const cropH = Math.max(1, Math.round(crop.h))
  const work = document.createElement("canvas")
  work.width = cropW
  work.height = cropH
  const wctx = work.getContext("2d", { willReadFrequently: true })
  if (!wctx) throw new Error("buildMiniCanvas: work 2D context unavailable")
  wctx.imageSmoothingEnabled = false
  wctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, cropW, cropH)
  const cropData = wctx.getImageData(0, 0, cropW, cropH).data

  // (2) True area-average per cell (mirrors server Image.BOX).
  const { r, g, b } = cellAreaAverages({
    rgba: cropData,
    width: cropW,
    height: cropH,
    cellsX,
    cellsY,
  })

  // (3) Optional median-cut quantise to num_colors — UNCHANGED colour
  // model. (Server parity is a separate, deferred concern.)
  const cellCount = cellsX * cellsY
  if (numColors >= 2 && cellCount >= 2) {
    const pixels: RgbPixel[] = new Array(cellCount)
    for (let i = 0; i < cellCount; i += 1) pixels[i] = [r[i], g[i], b[i]]
    const cmap = quantize(pixels, numColors)
    if (cmap) {
      for (let i = 0; i < cellCount; i += 1) {
        const mapped = cmap.map([r[i], g[i], b[i]])
        r[i] = mapped[0]
        g[i] = mapped[1]
        b[i] = mapped[2]
      }
    }
  }

  // (4) Paint the cell palette onto the visible target at source-crop
  // resolution. Each cell is one solid rectangle; no source downsample
  // touches the visible canvas.
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
}
