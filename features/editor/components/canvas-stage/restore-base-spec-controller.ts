"use client"

import { useEffect, type MutableRefObject } from "react"

import type { RestoreBaseSpec } from "./restore-controller"

export function useRestoreBaseSpecController(args: {
  restoreBaseImageId?: string | null
  restoreBaseWidthPx?: number
  restoreBaseHeightPx?: number
  restoreBaseDpi?: number | null
  restoreBaseSpecRef: MutableRefObject<RestoreBaseSpec | null>
}) {
  const { restoreBaseImageId, restoreBaseWidthPx, restoreBaseHeightPx, restoreBaseDpi, restoreBaseSpecRef } = args

  useEffect(() => {
    const imageId = restoreBaseImageId ?? null
    const widthPx = typeof restoreBaseWidthPx === "number" && Number.isFinite(restoreBaseWidthPx) ? restoreBaseWidthPx : 0
    const heightPx = typeof restoreBaseHeightPx === "number" && Number.isFinite(restoreBaseHeightPx) ? restoreBaseHeightPx : 0
    const dpi = typeof restoreBaseDpi === "number" && Number.isFinite(restoreBaseDpi) && restoreBaseDpi > 0 ? restoreBaseDpi : null
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
    restoreBaseSpecRef.current = { imageId, widthPx, heightPx, dpi }
  }, [restoreBaseDpi, restoreBaseHeightPx, restoreBaseImageId, restoreBaseSpecRef, restoreBaseWidthPx])
}
