"use client"

import { useEffect, type MutableRefObject } from "react"

import { numberToMicroPx } from "@/lib/editor/konva"
import { pickIntrinsicSize, shouldApplyPersistedTransform } from "./placement"
import type { RestoreBaseSpec } from "./restore-controller"
import type { ImageState } from "@/lib/editor/hooks/use-image-state"
import type { createStateSyncGuard } from "./state-sync-guard"

export function useImagePlacementSync(args: {
  src?: string
  img: HTMLImageElement | null
  activeImageId?: string | null
  hasArtboard: boolean
  artW: number
  artH: number
  initialImageTransform?: ImageState | null
  intrinsicWidthPx?: number
  intrinsicHeightPx?: number
  restoreBaseImageId?: string | null
  restoreBaseWidthPx?: number
  restoreBaseHeightPx?: number
  stateSyncGuardRef: MutableRefObject<ReturnType<typeof createStateSyncGuard>>
  placedKeyRef: MutableRefObject<string | null>
  restoreBaseSpecRef: MutableRefObject<RestoreBaseSpec | null>
  scheduleBoundsUpdate: () => void
  setRotation: (next: number) => void
  setImageTx: (next: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null) => void
}) {
  const {
    src,
    img,
    activeImageId,
    hasArtboard,
    artW,
    artH,
    initialImageTransform,
    intrinsicWidthPx,
    intrinsicHeightPx,
    restoreBaseImageId,
    restoreBaseWidthPx,
    restoreBaseHeightPx,
    stateSyncGuardRef,
    placedKeyRef,
    restoreBaseSpecRef,
    scheduleBoundsUpdate,
    setRotation,
    setImageTx,
  } = args

  useEffect(() => {
    stateSyncGuardRef.current.resetForNewImage()
  }, [activeImageId, stateSyncGuardRef])

  useEffect(() => {
    const imageId = restoreBaseImageId ?? null
    const widthPx = typeof restoreBaseWidthPx === "number" && Number.isFinite(restoreBaseWidthPx) ? restoreBaseWidthPx : 0
    const heightPx = typeof restoreBaseHeightPx === "number" && Number.isFinite(restoreBaseHeightPx) ? restoreBaseHeightPx : 0
    const current = restoreBaseSpecRef.current
    if (!imageId) {
      restoreBaseSpecRef.current = null
      return
    }
    if (current?.imageId && current.imageId !== imageId) {
      restoreBaseSpecRef.current = null
    }
    if (!(widthPx > 0 && heightPx > 0)) {
      restoreBaseSpecRef.current = null
      return
    }
    restoreBaseSpecRef.current = { imageId, widthPx, heightPx }
  }, [restoreBaseHeightPx, restoreBaseImageId, restoreBaseSpecRef, restoreBaseWidthPx])

  useEffect(() => {
    if (!img) return
    if (!src) return
    if (!initialImageTransform) return
    if (
      !shouldApplyPersistedTransform({
        src,
        appliedKey: stateSyncGuardRef.current.getAppliedKey(),
        userChanged: stateSyncGuardRef.current.hasUserChanged(),
        activeImageId,
        stateImageId: initialImageTransform.imageId,
        initialImageTransform,
      })
    )
      return

    const rotationDeg = Number(initialImageTransform.rotationDeg)
    const nextWidthPxU = initialImageTransform.widthPxU
    const nextHeightPxU = initialImageTransform.heightPxU
    if (!nextWidthPxU || !nextHeightPxU) return

    const xPxU = initialImageTransform.xPxU ?? 0n
    const yPxU = initialImageTransform.yPxU ?? 0n

    stateSyncGuardRef.current.scheduleApply(src, () => {
      setRotation(Number.isFinite(rotationDeg) ? rotationDeg : 0)
      setImageTx({ xPxU, yPxU, widthPxU: nextWidthPxU, heightPxU: nextHeightPxU })
      scheduleBoundsUpdate()
    })
  }, [activeImageId, img, initialImageTransform, scheduleBoundsUpdate, setImageTx, setRotation, src, stateSyncGuardRef])

  useEffect(() => {
    if (!src) return
    if (!img) return
    if (stateSyncGuardRef.current.hasUserChanged()) return
    if (!hasArtboard) return
    const hasPersistedSize = Boolean(
      initialImageTransform?.widthPxU &&
        initialImageTransform?.heightPxU &&
        initialImageTransform?.imageId &&
        activeImageId &&
        initialImageTransform.imageId === activeImageId
    )
    if (hasPersistedSize) return
    if (stateSyncGuardRef.current.getAppliedKey() === src) return

    const key = `${src}:${artW}x${artH}`
    if (placedKeyRef.current === key) return
    placedKeyRef.current = key

    const intrinsic = pickIntrinsicSize({ intrinsicWidthPx, intrinsicHeightPx, img })
    if (!intrinsic) return
    const baseW = intrinsic.w
    const baseH = intrinsic.h

    queueMicrotask(() => {
      setRotation(0)
      setImageTx({
        xPxU: numberToMicroPx(artW / 2),
        yPxU: numberToMicroPx(artH / 2),
        widthPxU: numberToMicroPx(baseW),
        heightPxU: numberToMicroPx(baseH),
      })
    })
  }, [
    activeImageId,
    artH,
    artW,
    hasArtboard,
    img,
    initialImageTransform,
    intrinsicHeightPx,
    intrinsicWidthPx,
    placedKeyRef,
    setImageTx,
    setRotation,
    src,
    stateSyncGuardRef,
  ])
}
