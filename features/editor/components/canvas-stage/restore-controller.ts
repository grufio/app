"use client"

import { useCallback, type RefObject } from "react"

import type { TransformController } from "./transform-controller"

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
}): { ok: true; baseW: number; baseH: number } | { ok: false; reason: "not_ready" | "missing_base_spec" | "stale_base_spec" } {
  const { artW, artH, baseSpec, activeImageId } = args
  if (!(artW > 0 && artH > 0)) return { ok: false, reason: "not_ready" }
  if (!baseSpec) return { ok: false, reason: "missing_base_spec" }
  if (activeImageId && baseSpec.imageId && activeImageId !== baseSpec.imageId) return { ok: false, reason: "stale_base_spec" }
  if (!(baseSpec.widthPx > 0 && baseSpec.heightPx > 0)) return { ok: false, reason: "missing_base_spec" }
  return { ok: true, baseW: baseSpec.widthPx, baseH: baseSpec.heightPx }
}

export function useRestoreImageController(opts: {
  artW: number
  artH: number
  restoreBaseSpecRef: RefObject<RestoreBaseSpec | null>
  activeImageId?: string | null
  initialImageTransform?: {
    xPxU?: bigint
    yPxU?: bigint
    widthPxU?: bigint
    heightPxU?: bigint
    rotationDeg: number
  } | null
  transformControllerRef: RefObject<TransformController | null>
  scheduleBoundsUpdate: () => void
}) {
  const {
    artW,
    artH,
    restoreBaseSpecRef,
    activeImageId,
    initialImageTransform,
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
      artW,
      artH,
      baseW: resolved.baseW,
      baseH: resolved.baseH,
      initialImageTransform,
    })
    scheduleBoundsUpdate()
    return { ok: true } satisfies RestoreImageResult
  }, [activeImageId, artH, artW, initialImageTransform, restoreBaseSpecRef, scheduleBoundsUpdate, transformControllerRef])
}

