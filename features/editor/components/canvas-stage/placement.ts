export { computeDpiRelativePlacementPx, FALLBACK_IMAGE_DPI, type ImagePlacementPx } from "@/lib/editor/image-placement"

/**
 * Placement/persist gating helpers (pure).
 *
 * Responsibilities:
 * - Pick intrinsic image size from metadata/DOM safely.
 * - Compute initial/restore placement using a DPI-relative contract.
 * - Gate when persisted transforms should be applied vs user-changed state.
 */
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

export function shouldApplyPersistedTransform(args: {
  src: string | undefined
  appliedKey: string | null
  userChanged: boolean
  activeImageId?: string | null
  /**
   * Kept on the signature for backward compat with callers and tests;
   * no longer used. After PR #124 anchored `project_image_state` at
   * `master.id`, the state row's `image_id` always points at the
   * master while the canvas activeImageId points at the filter-base-
   * copy / chain tip — the equality check was structurally false on
   * every page open, so saves never reached the canvas. State is now
   * project-wide; if it exists, it applies to whichever surface the
   * canvas is rendering.
   */
  stateImageId?: string | null
  initialImageTransform: { widthPxU?: bigint; heightPxU?: bigint } | null | undefined
}): boolean {
  const { src, appliedKey, userChanged, activeImageId, initialImageTransform } = args
  if (!src) return false
  if (userChanged) return false
  if (!initialImageTransform) return false
  if (!activeImageId) return false
  if (appliedKey === src) return false
  return Boolean(initialImageTransform.widthPxU && initialImageTransform.heightPxU)
}
