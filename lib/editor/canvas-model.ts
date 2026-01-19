export type Size = { w: number; h: number }

export type Viewport = {
  scale: number
  x: number
  y: number
}

export type Pointer = { x: number; y: number }

/**
 * Fit world into view, optionally reserving a uniform padding (in screen px) around it.
 * Padding affects only the computed "fit" view and is NOT enforced during user pan/zoom.
 */
export function fitToWorld(viewSize: Size, worldSize: Size, paddingPx = 0): Viewport {
  const p = Math.max(0, Number(paddingPx) || 0)
  const vw = Math.max(0, viewSize.w - 2 * p)
  const vh = Math.max(0, viewSize.h - 2 * p)
  if (vw === 0 || vh === 0 || worldSize.w <= 0 || worldSize.h <= 0) return { scale: 1, x: 0, y: 0 }

  const scale = Math.min(vw / worldSize.w, vh / worldSize.h)
  const x = (vw - worldSize.w * scale) / 2 + p
  const y = (vh - worldSize.h * scale) / 2 + p
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

