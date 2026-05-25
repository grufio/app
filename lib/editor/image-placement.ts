/**
 * Image placement on the artboard.
 *
 * The artboard has no DPI (Illustrator-style). Internal coordinates
 * are fixed-mapping pixels with `1 px = 1/72 inch`. When a raster is
 * placed for the first time, it appears at its physical size derived
 * from the intrinsic image DPI:
 *
 *   widthPx_internal = intrinsicW_px / imageDpi * 72
 *
 * Images without DPI metadata fall back to 72 PPI (web default), so a
 * 3000-px image would render at ~1058 mm.
 *
 * Clamp: that physical size is then contain-fit DOWN to the artboard, so a
 * placement never exceeds the artboard. Scale-down only — an image that fits
 * keeps its physical size and a small image is never upscaled (no auto-fit).
 * A 72-PPI photo that is larger than the artboard is therefore placed at the
 * artboard size instead of metres-wide.
 */
export const FALLBACK_IMAGE_DPI = 72
const MICRO_PX_SCALE = 1_000_000
const GEOMETRY_PPI = 72

export type ImagePlacementPx = {
  xPx: number
  yPx: number
  widthPx: number
  heightPx: number
}

function normalizeImageDpi(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return FALLBACK_IMAGE_DPI
  return value
}

export function computeImagePlacementPx(args: {
  artW: number
  artH: number
  intrinsicW: number
  intrinsicH: number
  imageDpi?: number | null
}): ImagePlacementPx | null {
  const { artW, artH, intrinsicW, intrinsicH, imageDpi } = args
  if (!(artW > 0 && artH > 0 && intrinsicW > 0 && intrinsicH > 0)) return null

  const sourceDpi = normalizeImageDpi(imageDpi)
  const scale = GEOMETRY_PPI / sourceDpi
  if (!Number.isFinite(scale) || scale <= 0) return null

  const physicalW = intrinsicW * scale
  const physicalH = intrinsicH * scale

  // Clamp: an image is never placed larger than its artboard. Contain-fit,
  // scale-DOWN only — `fit` is capped at 1, so an image that already fits is
  // unchanged and a small image is NEVER upscaled (no auto-fit). The bound is
  // the real artboard, not a magic constant. `physicalW/H > 0` here
  // (intrinsic > 0, scale > 0), so the divisions are safe.
  const fit = Math.min(1, artW / physicalW, artH / physicalH)

  return {
    xPx: artW / 2,
    yPx: artH / 2,
    widthPx: physicalW * fit,
    heightPx: physicalH * fit,
  }
}

function numberToMicroPxString(valuePx: number, args?: { minOne?: boolean }): string {
  const rounded = BigInt(Math.round(valuePx * MICRO_PX_SCALE))
  if (args?.minOne) return (rounded > 0n ? rounded : 1n).toString()
  return rounded.toString()
}

export function placementPxToMicroPx(args: ImagePlacementPx): {
  xPxU: string
  yPxU: string
  widthPxU: string
  heightPxU: string
} {
  return {
    xPxU: numberToMicroPxString(args.xPx),
    yPxU: numberToMicroPxString(args.yPx),
    widthPxU: numberToMicroPxString(args.widthPx, { minOne: true }),
    heightPxU: numberToMicroPxString(args.heightPx, { minOne: true }),
  }
}
