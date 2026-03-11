export const FALLBACK_IMAGE_DPI = 72
const MICRO_PX_SCALE = 1_000_000

export type ImagePlacementPx = {
  xPx: number
  yPx: number
  widthPx: number
  heightPx: number
}

function normalizeArtboardDpi(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
  return value
}

function normalizeImageDpi(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return FALLBACK_IMAGE_DPI
  return value
}

export function computeDpiRelativePlacementPx(args: {
  artW: number
  artH: number
  intrinsicW: number
  intrinsicH: number
  artboardDpi?: number | null
  imageDpi?: number | null
}): ImagePlacementPx | null {
  const { artW, artH, intrinsicW, intrinsicH, artboardDpi, imageDpi } = args
  if (!(artW > 0 && artH > 0 && intrinsicW > 0 && intrinsicH > 0)) return null

  const outputDpi = normalizeArtboardDpi(artboardDpi)
  if (!outputDpi) return null
  const sourceDpi = normalizeImageDpi(imageDpi)
  const scale = sourceDpi / outputDpi
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
