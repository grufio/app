"use client"

/**
 * Initial-placement controller — picks the canvas transform for a
 * freshly mounted image.
 *
 * Decision tree (in order, first match wins):
 * 1. **Bail-outs** — no `src`, no `img`, user has edited, no artboard,
 *    invalid artboard DPI → return immediately.
 * 2. **Persisted path** — `shouldApplyPersistedTransform()` says yes
 *    (we have a server-side transform anchored at master.id). Apply
 *    those exact µpx values; ignore the default-placement branch.
 * 3. **Default-placement path** — otherwise compute a DPI-relative
 *    placement that fits the image into the artboard. Keyed on
 *    `src + artW + artH + artboardDpi + imageDpi` so DPI changes
 *    re-run the computation, but plain re-renders don't.
 *
 * Race-safety: every apply is funneled through
 * `stateSyncGuard.scheduleApply()` — see `state-sync-guard.ts` for the
 * sequence-number cancel semantics. If the persisted state arrives
 * after a default placement is queued, the persisted apply correctly
 * supersedes the default via the bump.
 *
 * The effect has 16 dependencies because it sits at the intersection
 * of three orthogonal triggers (image-source change, artboard-size
 * change, persisted-state arrival) and React's exhaustive-deps lint
 * is happy with that — splitting it into multiple effects would
 * break the "latest-scheduled-apply wins" ordering invariant.
 */

import { useEffect, type MutableRefObject } from "react"

import { numberToMicroPx } from "@/lib/editor/konva"

import { computeDpiRelativePlacementPx, pickIntrinsicSize, shouldApplyPersistedTransform } from "./placement"

type PersistedTransform = {
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
        userChanged: stateSyncGuardRef.current.hasUserChanged(),
        activeImageId,
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
