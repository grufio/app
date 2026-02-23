"use client"

import { useCallback, useEffect, useRef, type RefObject } from "react"

import { numberToMicroPx } from "@/lib/editor/konva"
import { pxUToPxNumber } from "@/lib/editor/units"
import type { ViewState } from "./types"

export type ResizeHandle = "tl" | "tm" | "tr" | "rm" | "br" | "bm" | "bl" | "lm"
type ImageTx = { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint }
type FrameRect = { x: number; y: number; w: number; h: number }

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
        const left = prevFrame.x
        const right = prevFrame.x + prevFrame.w
        const top = prevFrame.y
        const bottom = prevFrame.y + prevFrame.h
        let nLeft = left
        let nRight = right
        let nTop = top
        let nBottom = bottom

        if (handle === "tl" || handle === "lm" || handle === "bl") nLeft = pointerX
        if (handle === "tr" || handle === "rm" || handle === "br") nRight = pointerX
        if (handle === "tl" || handle === "tm" || handle === "tr") nTop = pointerY
        if (handle === "bl" || handle === "bm" || handle === "br") nBottom = pointerY

        if (nRight - nLeft < 1) {
          if (handle === "tl" || handle === "lm" || handle === "bl") nLeft = nRight - 1
          else nRight = nLeft + 1
        }
        if (nBottom - nTop < 1) {
          if (handle === "tl" || handle === "tm" || handle === "tr") nTop = nBottom - 1
          else nBottom = nTop + 1
        }

        let next: FrameRect = { x: nLeft, y: nTop, w: nRight - nLeft, h: nBottom - nTop }
        if (keepAspect) {
          const aspect = prevFrame.w / Math.max(1e-6, prevFrame.h)
          const byW = { ...next, h: Math.max(1, next.w / aspect) }
          const byH = { ...next, w: Math.max(1, next.h * aspect) }
          const dW = Math.abs(byW.h - next.h)
          const dH = Math.abs(byH.w - next.w)
          next = dW <= dH ? byW : byH
          if (handle === "tl" || handle === "tm" || handle === "tr") next.y = nBottom - next.h
          if (handle === "tl" || handle === "lm" || handle === "bl") next.x = nRight - next.w
        }

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
      const onMove = (evt: MouseEvent) => {
        const root = containerRef.current
        if (!root) return
        const rect = root.getBoundingClientRect()
        const stageX = evt.clientX - rect.left
        const stageY = evt.clientY - rect.top
        const worldX = (stageX - view.x) / Math.max(1e-6, view.scale)
        const worldY = (stageY - view.y) / Math.max(1e-6, view.scale)
        applySelectResize(handle, worldX, worldY, keepAspectInitial || evt.shiftKey)
      }
      const onUp = () => {
        stop()
        scheduleCommitTransform(true, 0)
      }
      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
      cleanupRef.current = () => {
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }
    },
    [applySelectResize, containerRef, scheduleCommitTransform, stop, view.x, view.scale, view.y]
  )

  useEffect(() => () => stop(), [stop])

  return { beginSelectResize: begin, stopSelectResize: stop }
}

