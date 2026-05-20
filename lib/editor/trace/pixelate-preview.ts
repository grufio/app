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
 * Per-cell colours are computed once via a small offscreen canvas
 * (drawImage downsample to cellsX × cellsY + median-cut quantise).
 * The offscreen is throwaway — only the resulting palette is painted
 * onto the visible target.
 *
 * Caller (React) owns `target.width` / `target.height` via JSX props
 * set to `crop.w` / `crop.h`.
 */
import quantize from "quantize"
import type { RgbPixel } from "quantize"

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

  // (1) Compute per-cell colours on a tiny offscreen canvas. The
  // bilinear downsample isn't ideal for huge ratios but it's the
  // fast path and the user can't see this canvas — only the final
  // palette is rendered to the visible target.
  const palette = document.createElement("canvas")
  palette.width = cellsX
  palette.height = cellsY
  const pctx = palette.getContext("2d", { willReadFrequently: true })
  if (!pctx) throw new Error("buildMiniCanvas: offscreen 2D context unavailable")
  pctx.imageSmoothingEnabled = true
  pctx.imageSmoothingQuality = "high"
  pctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, cellsX, cellsY)

  if (numColors >= 2 && cellsX * cellsY >= 2) {
    const imageData = pctx.getImageData(0, 0, cellsX, cellsY)
    const buf = imageData.data
    const pixelCount = cellsX * cellsY
    const pixels: RgbPixel[] = new Array(pixelCount)
    for (let i = 0; i < pixelCount; i += 1) {
      const o = i * 4
      pixels[i] = [buf[o], buf[o + 1], buf[o + 2]]
    }
    const cmap = quantize(pixels, numColors)
    if (cmap) {
      for (let i = 0; i < pixelCount; i += 1) {
        const o = i * 4
        const mapped = cmap.map([buf[o], buf[o + 1], buf[o + 2]])
        buf[o] = mapped[0]
        buf[o + 1] = mapped[1]
        buf[o + 2] = mapped[2]
      }
      pctx.putImageData(imageData, 0, 0)
    }
  }

  // (2) Paint the cell palette onto the visible target at source-crop
  // resolution. Each cell is one solid rectangle, no source
  // downsample touches the visible canvas.
  const cellData = pctx.getImageData(0, 0, cellsX, cellsY)
  ctx.imageSmoothingEnabled = false
  const cellW = target.width / cellsX
  const cellH = target.height / cellsY
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const i = (cy * cellsX + cx) * 4
      ctx.fillStyle = `rgb(${cellData.data[i]}, ${cellData.data[i + 1]}, ${cellData.data[i + 2]})`
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
