/**
 * Pixel snap helpers (pure).
 *
 * Responsibilities:
 * - Snap world coordinates so 1px strokes render crisp at the current view scale.
 */
import { getDevicePixelRatio } from "./device-pixel-ratio"
import type { ViewState } from "./types"

/**
 * Pixel-snap helper: a 1-device-pixel stroke renders crispest when its center
 * lands on N + 0.5 DEVICE pixels. The Konva layer renders at `dpr`, so we
 * convert the screen (CSS-px) position into device pixels, snap the center to
 * N + 0.5, then convert back. At dpr=1 this collapses to the classic
 * half-CSS-pixel snap, so a single branch covers every ratio.
 */
export function snapWorldToDeviceHalfPixel(args: { worldCoord: number; axis: "x" | "y"; view: ViewState }): number {
  const { worldCoord, axis, view } = args
  const scale = view.scale || 1
  const offset = axis === "x" ? view.x : view.y
  const dpr = getDevicePixelRatio()
  const screenDev = (offset + worldCoord * scale) * dpr
  const snapped = (Math.round(screenDev - 0.5) + 0.5) / dpr
  return (snapped - offset) / scale
}

