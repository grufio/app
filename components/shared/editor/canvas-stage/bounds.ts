/**
 * Bounds helpers for the canvas stage.
 *
 * Responsibilities:
 * - Compute axis-aligned bounds for the image node (fast path and rotated path).
 * - Provide a small epsilon-based change detector for state updates.
 */
import type { BoundsRect } from "./types"
import type Konva from "konva"

export function boundsFromNodeNoRotation(node: { width(): number; height(): number; x(): number; y(): number }): BoundsRect {
  const w = node.width()
  const h = node.height()
  const x = node.x() - w / 2
  const y = node.y() - h / 2
  return { x, y, w, h }
}

export function boundsFromNodeClientRect(
  node: { getClientRect(config?: Konva.ShapeGetClientRectConfig): { x: number; y: number; width: number; height: number } },
  layer: Konva.Node
): BoundsRect {
  const r = node.getClientRect({ relativeTo: layer })
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

export function shouldUpdateBounds(prev: BoundsRect | null, next: BoundsRect, eps = 0.01): boolean {
  if (!prev) return true
  return !(
    Math.abs(prev.x - next.x) < eps &&
    Math.abs(prev.y - next.y) < eps &&
    Math.abs(prev.w - next.w) < eps &&
    Math.abs(prev.h - next.h) < eps
  )
}

