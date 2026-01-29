/**
 * Bounds controller for the canvas stage.
 *
 * Responsibilities:
 * - Update selection bounds from Konva nodes with rotation-aware logic.
 * - Accumulate drag deltas and apply them efficiently (RAF-friendly).
 */
import type Konva from "konva"

import { boundsFromNodeClientRect, boundsFromNodeNoRotation, shouldUpdateBounds } from "./bounds"
import type { BoundsRect } from "./types"

export type BoundsControllerDeps = {
  imageDraggable: () => boolean
  isE2E: () => boolean
  rotationDeg: () => number
  getLayer: () => Konva.Layer | null
  getImageNode: () => Konva.Image | null
  onBoundsChanged: (next: BoundsRect | null | ((prev: BoundsRect | null) => BoundsRect | null)) => void
  onBoundsRead?: () => void
}

export type BoundsController = {
  updateImageBoundsFromNode: () => void
  accumulateDragDelta: (dx: number, dy: number) => void
  flushDragBounds: () => void
}

export function createBoundsController(deps: BoundsControllerDeps): BoundsController {
  let dragAcc = { dx: 0, dy: 0 }

  const updateImageBoundsFromNode = () => {
    if (!deps.imageDraggable()) return
    const layer = deps.getLayer()
    const node = deps.getImageNode()
    if (!layer || !node) return

    if (deps.isE2E()) deps.onBoundsRead?.()

    const rot = deps.rotationDeg() % 360
    const next = rot === 0 ? boundsFromNodeNoRotation(node) : boundsFromNodeClientRect(node, layer)
    deps.onBoundsChanged((prev) => (shouldUpdateBounds(prev, next, 0.01) ? next : prev))
  }

  const accumulateDragDelta = (dx: number, dy: number) => {
    dragAcc.dx += dx
    dragAcc.dy += dy
  }

  const flushDragBounds = () => {
    const { dx, dy } = dragAcc
    dragAcc = { dx: 0, dy: 0 }
    if (dx === 0 && dy === 0) return
    deps.onBoundsChanged((prev) => {
      if (!prev) return prev
      return { x: prev.x + dx, y: prev.y + dy, w: prev.w, h: prev.h }
    })
  }

  return { updateImageBoundsFromNode, accumulateDragDelta, flushDragBounds }
}

