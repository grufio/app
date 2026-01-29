import type { ViewState } from "./types"

/**
 * Pixel-snap helper: for a 1px stroke, canvas looks crispest when the line center
 * lands on N + 0.5 device pixels in screen space.
 */
export function snapWorldToDeviceHalfPixel(args: { worldCoord: number; axis: "x" | "y"; view: ViewState }): number {
  const { worldCoord, axis, view } = args
  const scale = view.scale || 1
  const offset = axis === "x" ? view.x : view.y
  const screen = offset + worldCoord * scale
  const snapped = Math.round(screen - 0.5) + 0.5
  return (snapped - offset) / scale
}

