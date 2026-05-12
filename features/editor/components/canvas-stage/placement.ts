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
  userChanged: boolean
  activeImageId?: string | null
  initialImageTransform: { widthPxU?: bigint; heightPxU?: bigint } | null | undefined
}): boolean {
  // Persisted transform applies whenever a renderable canvas image
  // exists, the user hasn't yet edited the canvas in this session,
  // and persisted dimensions are present. The default-placement
  // re-fire guard (caller-side `appliedKey === src`) is separate
  // from this check and applies only to the default-branch.
  //
  // Notably absent: the `stateImageId === activeImageId` check that
  // existed before PR #124. After the master.id anchor, the state
  // row's image_id and the canvas activeImageId always differ, so
  // the equality check rejected every legitimate apply.
  const { src, userChanged, activeImageId, initialImageTransform } = args
  if (!src) return false
  if (userChanged) return false
  if (!initialImageTransform) return false
  if (!activeImageId) return false
  return Boolean(initialImageTransform.widthPxU && initialImageTransform.heightPxU)
}
