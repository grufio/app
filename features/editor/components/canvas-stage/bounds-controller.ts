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
  onClientRectRead?: () => void
  /**
   * SPIKE (trace-overlay-drag-sync): Fires alongside `onBoundsChanged`
   * with the same world-px frame delta. Lets the canvas mirror the
   * drag into `imageTx` React state so DOM-positioned overlays
   * (Trace) follow the Konva image during the drag instead of
   * snapping at drag-end.
   *
   * The historical assumption was that updating `imageTx` mid-drag
   * would create a prop-vs-imperative conflict with Konva's drag
   * handler. This spike tests that hypothesis. If green, the
   * structural plan in `~/.claude/plans/trace-overlay-drag-sync.md`
   * (imperative handle + RAF flag for the Trace SVG) becomes
   * obsolete.
   */
  onDragFlush?: (dxWorldPx: number, dyWorldPx: number) => void
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
    const next =
      rot === 0
        ? boundsFromNodeNoRotation(node)
        : (() => {
            if (deps.isE2E()) deps.onClientRectRead?.()
            return boundsFromNodeClientRect(node, layer)
          })()
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
    deps.onDragFlush?.(dx, dy)
  }

  return { updateImageBoundsFromNode, accumulateDragDelta, flushDragBounds }
}

