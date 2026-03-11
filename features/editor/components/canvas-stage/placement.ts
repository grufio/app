/**
 * Placement/persist gating helpers (pure).
 *
 * Responsibilities:
 * - Pick intrinsic image size from metadata/DOM safely.
 * - Compute initial/restore placement using a DPI-relative contract.
 * - Gate when persisted transforms should be applied vs user-changed state.
 */
export const FALLBACK_IMAGE_DPI = 72
export const FALLBACK_ARTBOARD_DPI = 300

export function pickIntrinsicSize(args: {
  intrinsicWidthPx?: number
  intrinsicHeightPx?: number
  img: { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | null
}): { w: number; h: number } | null {
  const { intrinsicWidthPx, intrinsicHeightPx, img } = args
  const metaW =
    typeof intrinsicWidthPx === "number" && Number.isFinite(intrinsicWidthPx) && intrinsicWidthPx > 0 ? intrinsicWidthPx : null
  const metaH =
    typeof intrinsicHeightPx === "number" && Number.isFinite(intrinsicHeightPx) && intrinsicHeightPx > 0 ? intrinsicHeightPx : null

  const fallbackW = img ? (img.naturalWidth || img.width || 0) : 0
  const fallbackH = img ? (img.naturalHeight || img.height || 0) : 0

  const w = metaW ?? fallbackW
  const h = metaH ?? fallbackH
  if (!w || !h) return null
  return { w, h }
}

export type ImagePlacementPx = {
  xPx: number
  yPx: number
  widthPx: number
  heightPx: number
}

function normalizePositiveDpi(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback
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

  const outputDpi = normalizePositiveDpi(artboardDpi, FALLBACK_ARTBOARD_DPI)
  const sourceDpi = normalizePositiveDpi(imageDpi, FALLBACK_IMAGE_DPI)
  const scale = outputDpi / sourceDpi
  if (!Number.isFinite(scale) || scale <= 0) return null

  return {
    xPx: artW / 2,
    yPx: artH / 2,
    widthPx: intrinsicW * scale,
    heightPx: intrinsicH * scale,
  }
}

export function shouldApplyPersistedTransform(args: {
  src: string | undefined
  appliedKey: string | null
  userChanged: boolean
  activeImageId?: string | null
  stateImageId?: string | null
  initialImageTransform: { widthPxU?: bigint; heightPxU?: bigint } | null | undefined
}): boolean {
  const { src, appliedKey, userChanged, activeImageId, stateImageId, initialImageTransform } = args
  if (!src) return false
  if (userChanged) return false
  if (!initialImageTransform) return false
  if (!activeImageId || !stateImageId || activeImageId !== stateImageId) return false
  if (appliedKey === src) return false
  return Boolean(initialImageTransform.widthPxU && initialImageTransform.heightPxU)
}
