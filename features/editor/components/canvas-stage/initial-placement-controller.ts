"use client"

import { useEffect, type MutableRefObject } from "react"

import { numberToMicroPx } from "@/lib/editor/konva"

import { computeDpiRelativePlacementPx, pickIntrinsicSize, shouldApplyPersistedTransform } from "./placement"

type PersistedTransform = {
  imageId?: string
  xPxU?: bigint
  yPxU?: bigint
  widthPxU?: bigint
  heightPxU?: bigint
  rotationDeg?: number
} | null | undefined

type StateSyncGuard = {
  hasUserChanged: () => boolean
  getAppliedKey: () => string | null
  scheduleApply: (key: string, apply: () => void) => void
}

export function useInitialImagePlacement(args: {
  src?: string
  img: { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | null
  hasArtboard: boolean
  artW: number
  artH: number
  artboardDpi?: number
  imageDpi?: number | null
  intrinsicWidthPx?: number
  intrinsicHeightPx?: number
  initialImageTransform?: PersistedTransform
  activeImageId?: string | null
  placedKeyRef: MutableRefObject<string | null>
  stateSyncGuardRef: MutableRefObject<StateSyncGuard>
  setRotation: (deg: number) => void
  setImageTx: (next: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint }) => void
  scheduleBoundsUpdate: () => void
}) {
  const {
    src,
    img,
    hasArtboard,
    artW,
    artH,
    artboardDpi,
    imageDpi,
    intrinsicWidthPx,
    intrinsicHeightPx,
    initialImageTransform,
    activeImageId,
    placedKeyRef,
    stateSyncGuardRef,
    setRotation,
    setImageTx,
    scheduleBoundsUpdate,
  } = args

  useEffect(() => {
    if (!src) return
    if (!img) return
    if (stateSyncGuardRef.current.hasUserChanged()) return
    if (!hasArtboard) return
    if (typeof artboardDpi !== "number" || !Number.isFinite(artboardDpi) || artboardDpi <= 0) return

    if (
      shouldApplyPersistedTransform({
        src,
        appliedKey: stateSyncGuardRef.current.getAppliedKey(),
        userChanged: stateSyncGuardRef.current.hasUserChanged(),
        activeImageId,
        stateImageId: initialImageTransform?.imageId,
        initialImageTransform,
      })
    ) {
      const nextWidthPxU = initialImageTransform?.widthPxU
      const nextHeightPxU = initialImageTransform?.heightPxU
      if (!nextWidthPxU || !nextHeightPxU) return
      const xPxU = initialImageTransform?.xPxU ?? 0n
      const yPxU = initialImageTransform?.yPxU ?? 0n
      const rotationDeg = Number(initialImageTransform?.rotationDeg ?? 0)

      stateSyncGuardRef.current.scheduleApply(src, () => {
        setRotation(Number.isFinite(rotationDeg) ? rotationDeg : 0)
        setImageTx({ xPxU, yPxU, widthPxU: nextWidthPxU, heightPxU: nextHeightPxU })
        scheduleBoundsUpdate()
      })
      return
    }

    if (stateSyncGuardRef.current.getAppliedKey() === src) return

    const key = `${src}:${artW}x${artH}:adpi${artboardDpi ?? ""}:idpi${imageDpi ?? ""}`
    if (placedKeyRef.current === key) return
    placedKeyRef.current = key

    const intrinsic = pickIntrinsicSize({ intrinsicWidthPx, intrinsicHeightPx, img })
    if (!intrinsic) return

    const placement = computeDpiRelativePlacementPx({
      artW,
      artH,
      intrinsicW: intrinsic.w,
      intrinsicH: intrinsic.h,
      artboardDpi,
      imageDpi,
    })
    if (!placement) return

    stateSyncGuardRef.current.scheduleApply(src, () => {
      setRotation(0)
      setImageTx({
        xPxU: numberToMicroPx(placement.xPx),
        yPxU: numberToMicroPx(placement.yPx),
        widthPxU: numberToMicroPx(placement.widthPx),
        heightPxU: numberToMicroPx(placement.heightPx),
      })
      scheduleBoundsUpdate()
    })
  }, [
    activeImageId,
    artH,
    artW,
    artboardDpi,
    hasArtboard,
    imageDpi,
    img,
    initialImageTransform,
    intrinsicHeightPx,
    intrinsicWidthPx,
    placedKeyRef,
    setImageTx,
    setRotation,
    src,
    stateSyncGuardRef,
    scheduleBoundsUpdate,
  ])
}
