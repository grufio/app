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
  // Kept for API stability; the appliedKey check used to live here and
  // would block the default→persisted upgrade race documented below.
  appliedKey: string | null
  userChanged: boolean
  activeImageId?: string | null
  stateImageId?: string | null
  initialImageTransform: { widthPxU?: bigint; heightPxU?: bigint } | null | undefined
}): boolean {
  // No `appliedKey === src` short-circuit on purpose: the placement
  // controller's first effect pass typically runs before the async
  // `loadImageState` returns. At that point `initialImageTransform`
  // is null and the controller schedules a default placement, which
  // sets `appliedKey = src` immediately (synchronous side effect of
  // `scheduleApply`). When the persisted state arrives a moment
  // later and re-runs the effect, blocking on `appliedKey === src`
  // would prevent the legitimate default→persisted upgrade and the
  // user's saved size would never reach the canvas.
  // `scheduleApply`'s sequence number already cancels the queued
  // default microtask in favour of the persisted one, so it's safe
  // to schedule a second time.
  const { src, userChanged, activeImageId, stateImageId, initialImageTransform } = args
  if (!src) return false
  if (userChanged) return false
  if (!initialImageTransform) return false
  if (!activeImageId || !stateImageId || activeImageId !== stateImageId) return false
  return Boolean(initialImageTransform.widthPxU && initialImageTransform.heightPxU)
}
