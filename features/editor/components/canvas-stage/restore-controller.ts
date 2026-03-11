"use client"

import { useCallback, type RefObject } from "react"

import type { TransformController } from "./transform-controller"
import type { RestoreBaseSpec } from "./restore-request"
import { resolveRestoreImageRequest } from "./restore-request"

export type { RestoreBaseSpec }

export type RestoreImageResult =
  | { ok: true }
  | { ok: false; reason: "not_ready" | "missing_base_spec" | "stale_base_spec" | "controller_unavailable" }

export { resolveRestoreImageRequest }

export function useRestoreImageController(opts: {
  artW: number
  artH: number
  restoreBaseSpecRef: RefObject<RestoreBaseSpec | null>
  artboardDpi?: number | null
  activeImageId?: string | null
  transformControllerRef: RefObject<TransformController | null>
  scheduleBoundsUpdate: () => void
}) {
  const {
    artW,
    artH,
    restoreBaseSpecRef,
    artboardDpi,
    activeImageId,
    transformControllerRef,
    scheduleBoundsUpdate,
  } = opts

  return useCallback(() => {
    const resolved = resolveRestoreImageRequest({
      artW,
      artH,
      baseSpec: restoreBaseSpecRef.current,
      artboardDpi,
      activeImageId,
    })
    if (!resolved.ok) return resolved
    if (!transformControllerRef.current) return { ok: false, reason: "controller_unavailable" } satisfies RestoreImageResult
    transformControllerRef.current.restoreImage({
      placement: resolved.placement,
    })
    scheduleBoundsUpdate()
    return { ok: true } satisfies RestoreImageResult
  }, [activeImageId, artH, artW, artboardDpi, restoreBaseSpecRef, scheduleBoundsUpdate, transformControllerRef])
}
