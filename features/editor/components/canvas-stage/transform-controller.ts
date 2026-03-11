/**
 * Transform/commit controller for the canvas stage.
 *
 * Responsibilities:
 * - Provide deterministic commit semantics for drag vs explicit actions.
 * - Translate between Konva node state and persisted µpx image transform state.
 */
import type Konva from "konva"

import type { MicroPx } from "@/lib/editor/imageState"
import {
  applyMicroPxPositionToNode,
  applyMicroPxToNode,
  bakeInSizeToMicroPx,
  readMicroPxPositionFromNode,
} from "@/lib/editor/konva"
import type { ImagePlacementPx } from "./placement"
import { createCommitScheduler } from "./transform-commit-scheduler"
import { alignNodeAndBuildImageTx, buildRestoreImageTx, resolveBasePositionMicroPx } from "./transform-ops"
import type { AlignImageOpts, ImageTx, TransformCommit } from "./transform-types"

export type TransformControllerDeps = {
  getImageNode: () => Konva.Image | null
  getLayer: () => Konva.Layer | null
  getRotationDeg: () => number
  setRotationDeg: (deg: number) => void
  getImageTx: () => ImageTx | null
  setImageTx: (next: ImageTx) => void
  markUserChanged: () => void
  onCommit?: (t: TransformCommit) => void
}

export type TransformController = {
  commitFromNode: (commitPosition: boolean) => void
  scheduleCommit: (commitPosition: boolean, delayMs?: number) => void
  dispose: () => void
  rotate90: () => void
  setImageSize: (widthPxU: MicroPx, heightPxU: MicroPx, fallbackCenterPx?: { x: number; y: number } | null) => void
  alignImage: (opts: AlignImageOpts) => void
  restoreImage: (opts: {
    placement: ImagePlacementPx
  }) => void
}

export function createTransformController(deps: TransformControllerDeps): TransformController {
  const commitFromNode = (commitPosition: boolean) => {
    const node = deps.getImageNode()
    if (!node) return
    const baked = bakeInSizeToMicroPx(node)
    const rotationDeg = deps.getRotationDeg()
    const pos = commitPosition ? readMicroPxPositionFromNode(node) : null
    const prev = deps.getImageTx()
    const xPxU = commitPosition ? pos?.xPxU : prev?.xPxU
    const yPxU = commitPosition ? pos?.yPxU : prev?.yPxU

    const next: ImageTx = {
      xPxU: (xPxU ?? 0n) as MicroPx,
      yPxU: (yPxU ?? 0n) as MicroPx,
      widthPxU: baked.widthPxU,
      heightPxU: baked.heightPxU,
    }
    deps.setImageTx(next)
    deps.onCommit?.({
      xPxU: commitPosition ? next.xPxU : undefined,
      yPxU: commitPosition ? next.yPxU : undefined,
      widthPxU: next.widthPxU,
      heightPxU: next.heightPxU,
      rotationDeg,
    })
  }

  const scheduler = createCommitScheduler((commitPosition) => {
    commitFromNode(commitPosition)
  })

  const rotate90 = () => {
    scheduler.cancel()
    const next = (deps.getRotationDeg() + 90) % 360
    deps.setRotationDeg(next)
    const prev = deps.getImageTx()
    if (!prev) return
    deps.markUserChanged()
    deps.onCommit?.({ xPxU: prev.xPxU, yPxU: prev.yPxU, widthPxU: prev.widthPxU, heightPxU: prev.heightPxU, rotationDeg: next })
  }

  const setImageSize = (widthPxU: MicroPx, heightPxU: MicroPx, fallbackCenterPx?: { x: number; y: number } | null) => {
    scheduler.cancel()
    if (widthPxU <= 0n || heightPxU <= 0n) return
    const prev = deps.getImageTx()
    const base = resolveBasePositionMicroPx({ prev, fallbackCenterPx })
    const next: ImageTx = { xPxU: base.xPxU, yPxU: base.yPxU, widthPxU, heightPxU }
    const node = deps.getImageNode()
    if (node) applyMicroPxToNode(node, widthPxU, heightPxU)
    deps.markUserChanged()
    deps.setImageTx(next)
    deps.onCommit?.({ xPxU: next.xPxU, yPxU: next.yPxU, widthPxU: next.widthPxU, heightPxU: next.heightPxU, rotationDeg: deps.getRotationDeg() })
  }

  const alignImage = (opts: AlignImageOpts) => {
    scheduler.cancel()
    const layer = deps.getLayer()
    const node = deps.getImageNode()
    if (!layer || !node) return
    const prev = deps.getImageTx()
    if (!prev) return

    const next = alignNodeAndBuildImageTx({ node, layer, prev, opts })
    if (!next) return

    deps.markUserChanged()
    deps.setImageTx(next)
    deps.onCommit?.({ xPxU: next.xPxU, yPxU: next.yPxU, widthPxU: next.widthPxU, heightPxU: next.heightPxU, rotationDeg: deps.getRotationDeg() })
  }

  const restoreImage = (opts: {
    placement: ImagePlacementPx
  }) => {
    scheduler.cancel()
    const next = buildRestoreImageTx(opts.placement)
    const rot = 0
    deps.setRotationDeg(rot)

    const node = deps.getImageNode()
    if (node) {
      applyMicroPxToNode(node, next.widthPxU, next.heightPxU)
      applyMicroPxPositionToNode(node, next.xPxU, next.yPxU)
    }
    deps.markUserChanged()
    deps.setImageTx(next)
    deps.onCommit?.({ xPxU: next.xPxU, yPxU: next.yPxU, widthPxU: next.widthPxU, heightPxU: next.heightPxU, rotationDeg: rot })
  }

  return {
    commitFromNode,
    scheduleCommit: (commitPosition: boolean, delayMs = 150) => {
      scheduler.schedule(commitPosition, delayMs)
    },
    dispose: () => {
      scheduler.cancel()
    },
    rotate90,
    setImageSize,
    alignImage,
    restoreImage,
  }
}
