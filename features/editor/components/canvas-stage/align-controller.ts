"use client"

import { useCallback, type RefObject } from "react"

import type { TransformController } from "./transform-controller"

export type AlignImageOptions = {
  x?: "left" | "center" | "right"
  y?: "top" | "center" | "bottom"
}

export function useAlignImageController(opts: {
  artW: number
  artH: number
  hasArtboard: boolean
  transformControllerRef: RefObject<TransformController | null>
  scheduleBoundsUpdate: () => void
}) {
  const { artW, artH, hasArtboard, transformControllerRef, scheduleBoundsUpdate } = opts

  return useCallback(
    (align: AlignImageOptions) => {
      if (!hasArtboard) return
      transformControllerRef.current?.alignImage({ artW, artH, ...align })
      scheduleBoundsUpdate()
    },
    [artH, artW, hasArtboard, scheduleBoundsUpdate, transformControllerRef]
  )
}

