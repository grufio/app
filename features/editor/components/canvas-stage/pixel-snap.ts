/**
 * Pixel snap helpers (pure).
 *
 * Responsibilities:
 * - Snap world coordinates so 1px strokes render crisp at the current view scale.
 */
import type { ViewState } from "./types"

/**
 * Pixel-snap helper: for a 1px stroke, canvas looks crispest when the line center
 * lands on N + 0.5 device pixels in screen space.
 */
export function snapWorldToDeviceHalfPixel(args: { worldCoord: number; axis: "x" | "y"; view: ViewState }): number {
  const { worldCoord, axis, view } = args
  const scale = view.scale || 1
  const offset = axis === "x" ? view.x : view.y
  const dpr =
    typeof window === "undefined" || !Number.isFinite(Number(window.devicePixelRatio))
      ? 1
      : Math.max(1, Number(window.devicePixelRatio))
  const screen = offset + worldCoord * scale
  // At DPR=1, center 1px strokes on half-pixels for crisp hairlines.
  // At DPR>1, snapping to full device pixels avoids perceived thickening.
  const snapped = dpr <= 1 ? Math.round(screen - 0.5) + 0.5 : Math.round(screen)
  return (snapped - offset) / scale
}

