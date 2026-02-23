"use client"

export type ResizeHandle = "tl" | "tm" | "tr" | "rm" | "br" | "bm" | "bl" | "lm"

export type FrameRect = { x: number; y: number; w: number; h: number }

function clampMinSize(args: { handle: ResizeHandle; left: number; right: number; top: number; bottom: number; minSize: number }) {
  let { left, right, top, bottom } = args
  const { handle, minSize } = args
  if (right - left < minSize) {
    if (handle === "tl" || handle === "lm" || handle === "bl") left = right - minSize
    else right = left + minSize
  }
  if (bottom - top < minSize) {
    if (handle === "tl" || handle === "tm" || handle === "tr") top = bottom - minSize
    else bottom = top + minSize
  }
  return { left, right, top, bottom }
}

export function applyResizeHandle(args: {
  prev: FrameRect
  handle: ResizeHandle
  pointerX: number
  pointerY: number
  minSize: number
  keepAspect: boolean
  clamp?: (next: FrameRect) => FrameRect
}): FrameRect {
  const { prev, handle, pointerX, pointerY, minSize, keepAspect, clamp } = args

  let left = prev.x
  let right = prev.x + prev.w
  let top = prev.y
  let bottom = prev.y + prev.h

  if (handle === "tl" || handle === "lm" || handle === "bl") left = pointerX
  if (handle === "tr" || handle === "rm" || handle === "br") right = pointerX
  if (handle === "tl" || handle === "tm" || handle === "tr") top = pointerY
  if (handle === "bl" || handle === "bm" || handle === "br") bottom = pointerY

  const clampedMin = clampMinSize({ handle, left, right, top, bottom, minSize })
  left = clampedMin.left
  right = clampedMin.right
  top = clampedMin.top
  bottom = clampedMin.bottom

  let next: FrameRect = { x: left, y: top, w: right - left, h: bottom - top }
  if (clamp) next = clamp(next)

  if (!keepAspect) return next

  const aspect = prev.w / Math.max(1e-6, prev.h)
  const byW = { ...next, h: Math.max(minSize, next.w / aspect) }
  const byH = { ...next, w: Math.max(minSize, next.h * aspect) }
  const dW = Math.abs(byW.h - next.h)
  const dH = Math.abs(byH.w - next.w)
  next = dW <= dH ? byW : byH

  if (handle === "tl" || handle === "tm" || handle === "tr") next.y = bottom - next.h
  if (handle === "tl" || handle === "lm" || handle === "bl") next.x = right - next.w
  if (clamp) next = clamp(next)
  return next
}

