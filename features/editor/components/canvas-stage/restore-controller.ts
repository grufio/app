"use client"

import { useCallback, type RefObject } from "react"

import type { TransformController } from "./transform-controller"
import { computeCenteredPlacementPx, type ImagePlacementPx } from "./placement"

export type RestoreBaseSpec = {
  imageId: string | null
  widthPx: number
  heightPx: number
}

export type RestoreImageResult =
  | { ok: true }
  | { ok: false; reason: "not_ready" | "missing_base_spec" | "stale_base_spec" | "controller_unavailable" }

export function resolveRestoreImageRequest(args: {
  artW: number
  artH: number
  baseSpec: RestoreBaseSpec | null
  activeImageId?: string | null
}): { ok: true; placement: ImagePlacementPx } | { ok: false; reason: "not_ready" | "missing_base_spec" | "stale_base_spec" } {
  const { artW, artH, baseSpec, activeImageId } = args
  if (!(artW > 0 && artH > 0)) return { ok: false, reason: "not_ready" }
  if (!baseSpec) return { ok: false, reason: "missing_base_spec" }
  if (activeImageId && baseSpec.imageId && activeImageId !== baseSpec.imageId) return { ok: false, reason: "stale_base_spec" }
  if (!(baseSpec.widthPx > 0 && baseSpec.heightPx > 0)) return { ok: false, reason: "missing_base_spec" }

  const placement = computeCenteredPlacementPx({
    artW,
    artH,
    intrinsicW: baseSpec.widthPx,
    intrinsicH: baseSpec.heightPx,
  })
  if (!placement) return { ok: false, reason: "not_ready" }

  return { ok: true, placement }
}

export function useRestoreImageController(opts: {
  artW: number
  artH: number
  restoreBaseSpecRef: RefObject<RestoreBaseSpec | null>
  activeImageId?: string | null
  transformControllerRef: RefObject<TransformController | null>
  scheduleBoundsUpdate: () => void
}) {
  const {
    artW,
    artH,
    restoreBaseSpecRef,
    activeImageId,
    transformControllerRef,
    scheduleBoundsUpdate,
  } = opts

  return useCallback(() => {
    const resolved = resolveRestoreImageRequest({
      artW,
      artH,
      baseSpec: restoreBaseSpecRef.current,
      activeImageId,
    })
    if (!resolved.ok) return resolved
    if (!transformControllerRef.current) return { ok: false, reason: "controller_unavailable" } satisfies RestoreImageResult
    transformControllerRef.current.restoreImage({
      placement: resolved.placement,
    })
    scheduleBoundsUpdate()
    return { ok: true } satisfies RestoreImageResult
  }, [activeImageId, artH, artW, restoreBaseSpecRef, scheduleBoundsUpdate, transformControllerRef])
}
