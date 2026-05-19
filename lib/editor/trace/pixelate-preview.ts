/**
 * Client-side render helpers for the Pixelate preview dialog.
 *
 * Three independent stages, one helper each:
 *   1. `buildScratchCanvas` — downsample the source image to a
 *      ≤maxEdge bitmap once per Source-Load. All later processing
 *      runs on this smaller canvas, not the original 4000px image.
 *   2. `buildMiniCanvas` — crop the scratch and downsample to a
 *      cellsX × cellsY pixel buffer (one pixel per superpixel cell),
 *      then quantize to `numColors` via median-cut.
 *   3. `renderDisplay` — nearest-neighbour upscale the mini onto the
 *      preview Canvas at the given zoom/pan, with devicePixelRatio
 *      handling for sharp output on Retina.
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

export function buildMiniCanvas(args: {
  scratch: HTMLCanvasElement
  crop: { x: number; y: number; w: number; h: number }
  cellsX: number
  cellsY: number
  numColors: number
}): HTMLCanvasElement {
  const { scratch, crop, cellsX, cellsY, numColors } = args
  const canvas = document.createElement("canvas")
  canvas.width = cellsX
  canvas.height = cellsY
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
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

  return canvas
}

export function renderDisplay(args: {
  display: HTMLCanvasElement
  mini: HTMLCanvasElement
  previewW: number
  previewH: number
  dstW: number
  dstH: number
  panX: number
  panY: number
  dpr: number
}): void {
  const { display, mini, previewW, previewH, dstW, dstH, panX, panY, dpr } = args

  const bufW = Math.max(1, Math.round(previewW * dpr))
  const bufH = Math.max(1, Math.round(previewH * dpr))
  if (display.width !== bufW) display.width = bufW
  if (display.height !== bufH) display.height = bufH
  display.style.width = `${previewW}px`
  display.style.height = `${previewH}px`

  const ctx = display.getContext("2d")
  if (!ctx) throw new Error("renderDisplay: 2D context unavailable")
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, bufW, bufH)
  ctx.scale(dpr, dpr)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(mini, 0, 0, mini.width, mini.height, panX, panY, dstW, dstH)
}
