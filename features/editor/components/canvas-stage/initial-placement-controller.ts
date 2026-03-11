"use client"

import { useEffect, type MutableRefObject } from "react"

import { numberToMicroPx } from "@/lib/editor/konva"

import { computeDpiRelativePlacementPx, pickIntrinsicSize } from "./placement"

type PersistedTransform = {
  imageId?: string
  widthPxU?: bigint
  heightPxU?: bigint
} | null | undefined

type StateSyncGuard = {
  hasUserChanged: () => boolean
  getAppliedKey: () => string | null
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
  } = args

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

    queueMicrotask(() => {
      setRotation(0)
      setImageTx({
        xPxU: numberToMicroPx(placement.xPx),
        yPxU: numberToMicroPx(placement.yPx),
        widthPxU: numberToMicroPx(placement.widthPx),
        heightPxU: numberToMicroPx(placement.heightPx),
      })
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
  ])
}
