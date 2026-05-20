/**
 * Client-side render helpers for the Pixelate preview dialog.
 *
 * Two stages:
 *   1. `buildScratchCanvas` — downsample the source image to a
 *      ≤maxEdge bitmap once per Source-Load. All later processing
 *      runs on this smaller canvas, not the original 4000px image.
 *   2. `buildMiniCanvas` — crop the scratch onto a caller-owned
 *      `target` canvas (sized cellsX × cellsY by React via JSX props),
 *      then quantize to `numColors` via median-cut. The browser does
 *      the nearest-neighbour upscale to display size via CSS
 *      `image-rendering: pixelated`.
 *
 * React-free; the dialog wires the lifecycle.
 */
import quantize from "quantize"
import type { RgbPixel } from "quantize"

export function buildScratchCanvas(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const srcW = img.naturalWidth
  const srcH = img.naturalHeight
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("buildScratchCanvas: 2D context unavailable")
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

/**
 * Draws the cropped + quantized mini onto a caller-owned `target`
 * canvas. Caller (React) owns `target.width` / `target.height` via
 * JSX props (set to cellsX × cellsY). This function only draws —
 * it doesn't resize the canvas, to avoid double-clear flicker on
 * grid changes.
 */
export function buildMiniCanvas(args: {
  target: HTMLCanvasElement
  scratch: HTMLCanvasElement
  crop: { x: number; y: number; w: number; h: number }
  cellsX: number
  cellsY: number
  numColors: number
}): void {
  const { target, scratch, crop, cellsX, cellsY, numColors } = args
  const ctx = target.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("buildMiniCanvas: 2D context unavailable")

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(scratch, crop.x, crop.y, crop.w, crop.h, 0, 0, cellsX, cellsY)

  if (numColors >= 2 && cellsX * cellsY >= 2) {
    const imageData = ctx.getImageData(0, 0, cellsX, cellsY)
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
      ctx.putImageData(imageData, 0, 0)
    }
  }
}
