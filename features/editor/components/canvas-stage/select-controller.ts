"use client"

import { useCallback, useEffect, useRef, type RefObject } from "react"

import { numberToMicroPx } from "@/lib/editor/konva"
import { pxUToPxNumber } from "@/lib/editor/units"
import { clientToWorldPoint } from "./coords"
import { applyResizeHandle, type FrameRect, type ResizeHandle } from "./resize-handle"
import type { ViewState } from "./types"
import { attachWindowMouseDragSession } from "./window-mouse-session"

export type { ResizeHandle } from "./resize-handle"

type ImageTx = { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint }

function frameRectToImageTx(rect: FrameRect): ImageTx {
  return {
    xPxU: numberToMicroPx(rect.x + rect.w / 2),
    yPxU: numberToMicroPx(rect.y + rect.h / 2),
    widthPxU: numberToMicroPx(Math.max(1, rect.w)),
    heightPxU: numberToMicroPx(Math.max(1, rect.h)),
  }
}

export function useSelectResizeController(opts: {
  containerRef: RefObject<HTMLDivElement | null>
  view: ViewState
  setImageTx: React.Dispatch<React.SetStateAction<ImageTx | null>>
  markUserChanged: () => void
  scheduleBoundsUpdate: () => void
  scheduleCommitTransform: (commitPosition: boolean, delayMs?: number) => void
}) {
  const { containerRef, view, setImageTx, markUserChanged, scheduleBoundsUpdate, scheduleCommitTransform } = opts
  const cleanupRef = useRef<null | (() => void)>(null)

  const stop = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
  }, [])

  const applySelectResize = useCallback(
    (handle: ResizeHandle, pointerX: number, pointerY: number, keepAspect: boolean) => {
      setImageTx((prevTx) => {
        if (!prevTx) return prevTx
        const prevFrame: FrameRect = {
          x: pxUToPxNumber(prevTx.xPxU) - pxUToPxNumber(prevTx.widthPxU) / 2,
          y: pxUToPxNumber(prevTx.yPxU) - pxUToPxNumber(prevTx.heightPxU) / 2,
          w: pxUToPxNumber(prevTx.widthPxU),
          h: pxUToPxNumber(prevTx.heightPxU),
        }
        const next = applyResizeHandle({
          prev: prevFrame,
          handle,
          pointerX,
          pointerY,
          minSize: 1,
          keepAspect,
        })

        markUserChanged()
        return frameRectToImageTx(next)
      })
      scheduleBoundsUpdate()
    },
    [markUserChanged, scheduleBoundsUpdate, setImageTx]
  )

  const begin = useCallback(
    (handle: ResizeHandle, keepAspectInitial: boolean) => {
      stop()
      const root = containerRef.current
      if (!root) return
      const containerRect = root.getBoundingClientRect()
      const onMove = (evt: MouseEvent) => {
        const { worldX, worldY } = clientToWorldPoint({
          clientX: evt.clientX,
          clientY: evt.clientY,
          containerRect,
          view,
        })
        applySelectResize(handle, worldX, worldY, keepAspectInitial || evt.shiftKey)
      }
      const onUp = () => {
        stop()
        scheduleCommitTransform(true, 0)
      }
      cleanupRef.current = attachWindowMouseDragSession({
        win: window,
        onMove,
        onUp: () => onUp(),
      })
    },
    [applySelectResize, containerRef, scheduleCommitTransform, stop, view]
  )

  useEffect(() => () => stop(), [stop])

  return { beginSelectResize: begin, stopSelectResize: stop }
}

