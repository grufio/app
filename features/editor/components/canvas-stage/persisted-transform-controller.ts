"use client"

import { useEffect, type MutableRefObject } from "react"

import { shouldApplyPersistedTransform } from "./placement"

type PersistedImageTransform = {
  imageId?: string
  xPxU?: bigint
  yPxU?: bigint
  widthPxU?: bigint
  heightPxU?: bigint
  rotationDeg: number
} | null | undefined

type StateSyncGuardLike = {
  getAppliedKey: () => string | null
  hasUserChanged: () => boolean
  scheduleApply: (key: string, apply: () => void) => void
}

export function usePersistedTransformController(args: {
  src?: string
  imgReady: boolean
  activeImageId?: string | null
  initialImageTransform?: PersistedImageTransform
  stateSyncGuardRef: MutableRefObject<StateSyncGuardLike>
  setRotation: (deg: number) => void
  setImageTx: (next: { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint }) => void
  scheduleBoundsUpdate: () => void
}) {
  const {
    src,
    imgReady,
    activeImageId,
    initialImageTransform,
    stateSyncGuardRef,
    setRotation,
    setImageTx,
    scheduleBoundsUpdate,
  } = args

  useEffect(() => {
    if (!imgReady) return
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
  }, [activeImageId, imgReady, initialImageTransform, scheduleBoundsUpdate, setImageTx, setRotation, src, stateSyncGuardRef])
}
