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
 * 3000-px image renders at ~1058 mm — matches Illustrator behavior for
 * a placed raster without EXIF DPI.
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

  return {
    xPx: artW / 2,
    yPx: artH / 2,
    widthPx: intrinsicW * scale,
    heightPx: intrinsicH * scale,
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
