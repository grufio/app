"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

import type { ViewState } from "./types"
import type { ResizeHandle } from "./select-controller"

export type CropRectWorld = { x: number; y: number; w: number; h: number }
export type CropSelectionPx = { x: number; y: number; w: number; h: number }
export type CropSelectionResult =
  | { ok: true; rect: CropSelectionPx }
  | { ok: false; reason: "crop_disabled" | "not_ready" | "rotated" | "invalid_intrinsic" }

function clampCropRect(rect: CropRectWorld, frame: CropRectWorld | null, minSize: number): CropRectWorld {
  const w = Math.max(minSize, rect.w)
  const h = Math.max(minSize, rect.h)
  if (!frame) return { x: rect.x, y: rect.y, w, h }
  const cw = Math.min(w, frame.w)
  const ch = Math.min(h, frame.h)
  const x = Math.min(Math.max(rect.x, frame.x), frame.x + frame.w - cw)
  const y = Math.min(Math.max(rect.y, frame.y), frame.y + frame.h - ch)
  return { x, y, w: cw, h: ch }
}

export function useCropController(opts: {
  cropEnabled: boolean
  view: ViewState
  containerRef: RefObject<HTMLDivElement | null>
  imageFrame: CropRectWorld | null
  cropMinSize: number
  cropLimitFrame: CropRectWorld | null
  intrinsicWidthPx?: number
  intrinsicHeightPx?: number
  imageRender: { w: number; h: number } | null
  rotation: number
}) {
  const {
    cropEnabled,
    view,
    containerRef,
    imageFrame,
    cropMinSize,
    cropLimitFrame,
    intrinsicWidthPx,
    intrinsicHeightPx,
    imageRender,
    rotation,
  } = opts

  const [cropRect, setCropRect] = useState<CropRectWorld | null>(null)
  const cropRectRef = useRef<CropRectWorld | null>(null)
  const cleanupRef = useRef<null | (() => void)>(null)
  const effectiveCropRect = useCallback((): CropRectWorld | null => {
    if (!cropEnabled || !imageFrame) return null
    return clampCropRect(cropRect ?? imageFrame, imageFrame, cropMinSize)
  }, [cropEnabled, cropMinSize, cropRect, imageFrame])
  useEffect(() => {
    cropRectRef.current = effectiveCropRect()
  }, [effectiveCropRect])

  const stopCropResize = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
  }, [])

  useEffect(() => {
    if (!cropEnabled) stopCropResize()
  }, [cropEnabled, stopCropResize])

  const applyCropMove = useCallback(
    (dx: number, dy: number) => {
      const base = cropRectRef.current
      if (!base) return
      setCropRect(clampCropRect({ ...base, x: dx, y: dy }, cropLimitFrame, cropMinSize))
    },
    [cropLimitFrame, cropMinSize]
  )

  const applyCropResize = useCallback(
    (handle: ResizeHandle, pointerX: number, pointerY: number, keepAspect: boolean) => {
      const prev = cropRectRef.current
      if (!prev) return
      setCropRect(() => {
        const left = prev.x
        const right = prev.x + prev.w
        const top = prev.y
        const bottom = prev.y + prev.h
        let nLeft = left
        let nRight = right
        let nTop = top
        let nBottom = bottom

        if (handle === "tl" || handle === "lm" || handle === "bl") nLeft = pointerX
        if (handle === "tr" || handle === "rm" || handle === "br") nRight = pointerX
        if (handle === "tl" || handle === "tm" || handle === "tr") nTop = pointerY
        if (handle === "bl" || handle === "bm" || handle === "br") nBottom = pointerY

        if (nRight - nLeft < cropMinSize) {
          if (handle === "tl" || handle === "lm" || handle === "bl") nLeft = nRight - cropMinSize
          else nRight = nLeft + cropMinSize
        }
        if (nBottom - nTop < cropMinSize) {
          if (handle === "tl" || handle === "tm" || handle === "tr") nTop = nBottom - cropMinSize
          else nBottom = nTop + cropMinSize
        }

        let next = clampCropRect({ x: nLeft, y: nTop, w: nRight - nLeft, h: nBottom - nTop }, cropLimitFrame, cropMinSize)
        if (keepAspect) {
          const aspect = prev.w / Math.max(1e-6, prev.h)
          const byW = { ...next, h: Math.max(cropMinSize, next.w / aspect) }
          const byH = { ...next, w: Math.max(cropMinSize, next.h * aspect) }
          const dW = Math.abs(byW.h - next.h)
          const dH = Math.abs(byH.w - next.w)
          next = dW <= dH ? byW : byH
          if (handle === "tl" || handle === "tm" || handle === "tr") next.y = nBottom - next.h
          if (handle === "tl" || handle === "lm" || handle === "bl") next.x = nRight - next.w
          next = clampCropRect(next, cropLimitFrame, cropMinSize)
        }
        return next
      })
    },
    [cropLimitFrame, cropMinSize]
  )

  const beginCropResize = useCallback(
    (handle: ResizeHandle, keepAspectInitial: boolean) => {
      stopCropResize()
      const onMove = (evt: MouseEvent) => {
        const root = containerRef.current
        if (!root) return
        const rect = root.getBoundingClientRect()
        const stageX = evt.clientX - rect.left
        const stageY = evt.clientY - rect.top
        const worldX = (stageX - view.x) / Math.max(1e-6, view.scale)
        const worldY = (stageY - view.y) / Math.max(1e-6, view.scale)
        applyCropResize(handle, worldX, worldY, keepAspectInitial || evt.shiftKey)
      }
      const onUp = () => stopCropResize()
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
      cleanupRef.current = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }
    },
    [applyCropResize, containerRef, stopCropResize, view.x, view.scale, view.y]
  )

  const getCropSelection = useCallback((): CropSelectionResult => {
    if (!cropEnabled) return { ok: false, reason: "crop_disabled" }
    if (!cropRectRef.current || !imageFrame || !imageRender) return { ok: false, reason: "not_ready" }
    if ((Math.round(rotation) % 360) !== 0) return { ok: false, reason: "rotated" }
    if (!intrinsicWidthPx || !intrinsicHeightPx || intrinsicWidthPx <= 0 || intrinsicHeightPx <= 0) {
      return { ok: false, reason: "invalid_intrinsic" }
    }

    const sx = intrinsicWidthPx / imageRender.w
    const sy = intrinsicHeightPx / imageRender.h
    const relX = cropRectRef.current.x - imageFrame.x
    const relY = cropRectRef.current.y - imageFrame.y
    const x = Math.max(0, Math.floor(relX * sx))
    const y = Math.max(0, Math.floor(relY * sy))
    const maxW = Math.max(1, intrinsicWidthPx - x)
    const maxH = Math.max(1, intrinsicHeightPx - y)
    const w = Math.max(1, Math.min(maxW, Math.floor(cropRectRef.current.w * sx)))
    const h = Math.max(1, Math.min(maxH, Math.floor(cropRectRef.current.h * sy)))
    return { ok: true, rect: { x, y, w, h } }
  }, [cropEnabled, imageFrame, imageRender, intrinsicHeightPx, intrinsicWidthPx, rotation])

  const getCropSelectionPx = useCallback(() => {
    const result = getCropSelection()
    return result.ok ? result.rect : null
  }, [getCropSelection])

  const resetCropSelection = useCallback(() => {
    if (!imageFrame) return
    setCropRect(clampCropRect(imageFrame, imageFrame, cropMinSize))
  }, [cropMinSize, imageFrame])

  useEffect(() => () => stopCropResize(), [stopCropResize])

  return {
    cropRect: effectiveCropRect(),
    setCropRect,
    applyCropMove,
    beginCropResize,
    getCropSelection,
    getCropSelectionPx,
    resetCropSelection,
    stopCropResize,
  }
}

