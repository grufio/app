"use client"

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react"

import { fitToWorld, zoomAround } from "@/lib/editor/canvas-model"

import type { ViewState } from "./types"

export function useViewController(args: {
  hasArtboard: boolean
  world: { w: number; h: number } | null
  size: { w: number; h: number }
  fitPadding: number
  setView: Dispatch<SetStateAction<ViewState>>
  userInteractedRef: MutableRefObject<boolean>
  autoFitKeyRef: MutableRefObject<string | null>
}) {
  const { hasArtboard, world, size, fitPadding, setView, userInteractedRef, autoFitKeyRef } = args

  const fitToView = useCallback(() => {
    if (!world) return
    if (size.w <= 0 || size.h <= 0) return
    userInteractedRef.current = false
    autoFitKeyRef.current = null
    setView(fitToWorld(size, world, fitPadding))
  }, [autoFitKeyRef, fitPadding, setView, size, userInteractedRef, world])

  const zoomIn = useCallback(() => {
    const pointer = { x: size.w / 2, y: size.h / 2 }
    userInteractedRef.current = true
    setView((v) => zoomAround(v, pointer, 1.1, 0.05, 8))
  }, [setView, size.h, size.w, userInteractedRef])

  const zoomOut = useCallback(() => {
    const pointer = { x: size.w / 2, y: size.h / 2 }
    userInteractedRef.current = true
    setView((v) => zoomAround(v, pointer, 1 / 1.1, 0.05, 8))
  }, [setView, size.h, size.w, userInteractedRef])

  useEffect(() => {
    if (!hasArtboard) return
    if (!world) return
    if (size.w <= 0 || size.h <= 0) return
    if (userInteractedRef.current) return

    const key = `${size.w}x${size.h}:${world.w}x${world.h}:p${fitPadding}`
    if (autoFitKeyRef.current === key) return
    autoFitKeyRef.current = key
    setView(fitToWorld(size, world, fitPadding))
  }, [autoFitKeyRef, fitPadding, hasArtboard, setView, size, userInteractedRef, world])

  return { fitToView, zoomIn, zoomOut }
}
