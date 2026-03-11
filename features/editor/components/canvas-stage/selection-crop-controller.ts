"use client"

import { useMemo, type Dispatch, type RefObject, type SetStateAction } from "react"

import { computeSelectionHandleRects } from "@/services/editor"

import { useCropController, type CropRectWorld } from "./crop-controller"
import { useSelectResizeController, type ResizeHandle } from "./select-controller"
import { useResizeListenerLifecycle } from "./stage-lifecycle-controller"
import type { ViewState } from "./types"

export function useSelectionCropController(args: {
  cropEnabled: boolean
  cropBusy: boolean
  imageDraggable: boolean
  panEnabled: boolean
  view: ViewState
  containerRef: RefObject<HTMLDivElement | null>
  imageFrame: CropRectWorld | null
  hasArtboard: boolean
  artW: number
  artH: number
  intrinsicWidthPx?: number
  intrinsicHeightPx?: number
  imageRender: { width: number; height: number } | null
  rotation: number
  selectionHandlePx: number
  snapWorldToDeviceHalfPixel: (worldCoord: number, axis: "x" | "y") => number
  setImageTx: Dispatch<
    SetStateAction<{
      xPxU: bigint
      yPxU: bigint
      widthPxU: bigint
      heightPxU: bigint
    } | null>
  >
  markUserChanged: () => void
  scheduleBoundsUpdate: () => void
  scheduleCommitTransform: (commitPosition: boolean, delayMs?: number) => void
}) {
  const {
    cropEnabled,
    cropBusy,
    imageDraggable,
    panEnabled,
    view,
    containerRef,
    imageFrame,
    hasArtboard,
    artW,
    artH,
    intrinsicWidthPx,
    intrinsicHeightPx,
    imageRender,
    rotation,
    selectionHandlePx,
    snapWorldToDeviceHalfPixel,
    setImageTx,
    markUserChanged,
    scheduleBoundsUpdate,
    scheduleCommitTransform,
  } = args

  const cropMinSize = 10
  const cropLimitFrame = hasArtboard ? { x: 0, y: 0, w: artW, h: artH } : imageFrame

  const { beginSelectResize, stopSelectResize } = useSelectResizeController({
    containerRef,
    view,
    setImageTx,
    markUserChanged,
    scheduleBoundsUpdate,
    scheduleCommitTransform,
  })

  const { cropRect, applyCropMove, beginCropResize, getCropSelection, getCropSelectionPx, resetCropSelection, stopCropResize } =
    useCropController({
      cropEnabled,
      view,
      containerRef,
      imageFrame,
      cropMinSize,
      cropLimitFrame,
      intrinsicWidthPx,
      intrinsicHeightPx,
      imageRender: imageRender ? { w: imageRender.width, h: imageRender.height } : null,
      rotation,
    })

  useResizeListenerLifecycle({
    cropBusy,
    cropEnabled,
    imageDraggable,
    panEnabled,
    stopSelectResize,
    stopCropResize,
  })

  const cropRects = useMemo(() => {
    if (!cropRect) return null
    return computeSelectionHandleRects({
      bounds: { x: cropRect.x, y: cropRect.y, w: cropRect.w, h: cropRect.h },
      view: { x: view.x, y: view.y, scale: view.scale },
      handlePx: selectionHandlePx,
      snapWorldToDeviceHalfPixel,
    })
  }, [cropRect, selectionHandlePx, snapWorldToDeviceHalfPixel, view.scale, view.x, view.y])

  const selectRects = useMemo(() => {
    if (!imageFrame) return null
    return computeSelectionHandleRects({
      bounds: { x: imageFrame.x, y: imageFrame.y, w: imageFrame.w, h: imageFrame.h },
      view: { x: view.x, y: view.y, scale: view.scale },
      handlePx: selectionHandlePx,
      snapWorldToDeviceHalfPixel,
    })
  }, [imageFrame, selectionHandlePx, snapWorldToDeviceHalfPixel, view.scale, view.x, view.y])

  return {
    beginSelectResize,
    cropRect,
    applyCropMove,
    beginCropResize,
    getCropSelection,
    getCropSelectionPx,
    resetCropSelection,
    cropRects,
    selectRects,
  }
}

export type { ResizeHandle }
