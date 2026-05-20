/**
 * Client-side render helper for the Pixelate preview dialog.
 *
 * `buildMiniCanvas` crops the source image onto a caller-owned
 * `target` canvas (sized cellsX × cellsY by React via JSX props),
 * then quantizes to `numColors` via median-cut. The browser does the
 * nearest-neighbour upscale to display size via CSS
 * `image-rendering: pixelated`.
 *
 * The source is accepted as `CanvasImageSource` so callers can pass
 * `HTMLImageElement` (the loaded source image) directly. No scratch-
 * canvas intermediate — the previous 2000px-edge downsample threw
 * away detail for large source images at small supercell sizes.
 * `ctx.drawImage` is hardware-accelerated for the source→cells
 * downsample, so we don't need a pre-cached lower-resolution copy.
 *
 * React-free; the dialog wires the lifecycle.
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

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, cellsX, cellsY)

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
