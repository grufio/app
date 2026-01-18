export type Size = { w: number; h: number }

export type Viewport = {
  scale: number
  x: number
  y: number
}

export type Pointer = { x: number; y: number }

export function fitToWorld(viewSize: Size, worldSize: Size): Viewport {
  const scale = Math.min(viewSize.w / worldSize.w, viewSize.h / worldSize.h)
  const x = (viewSize.w - worldSize.w * scale) / 2
  const y = (viewSize.h - worldSize.h * scale) / 2
  return { scale, x, y }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * Zoom around a pointer in screen coordinates.
 * Keeps the world point under the cursor stable.
 */
export function zoomAround(view: Viewport, pointer: Pointer, factor: number, minScale = 0.01, maxScale = 8): Viewport {
  const oldScale = view.scale
  const newScale = clamp(oldScale * factor, minScale, maxScale)
  if (newScale === oldScale) return view

  const mousePointTo = {
    x: (pointer.x - view.x) / oldScale,
    y: (pointer.y - view.y) / oldScale,
  }
  const x = pointer.x - mousePointTo.x * newScale
  const y = pointer.y - mousePointTo.y * newScale
  return { scale: newScale, x, y }
}

export function panBy(view: Viewport, dx: number, dy: number): Viewport {
  return { ...view, x: view.x - dx, y: view.y - dy }
}

export function scaleToMatchAspect(imgW: number, imgH: number, targetW?: number, targetH?: number): number | null {
  if (!Number.isFinite(imgW) || !Number.isFinite(imgH) || imgW <= 0 || imgH <= 0) return null
  const w = Number(targetW)
  const h = Number(targetH)
  if (Number.isFinite(w) && w > 0) return w / imgW
  if (Number.isFinite(h) && h > 0) return h / imgH
  return null
}

