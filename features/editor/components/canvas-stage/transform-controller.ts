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
  numberToMicroPx,
  readMicroPxPositionFromNode,
} from "@/lib/editor/konva"
import { getClientRectRelative, getNodeXY, setNodeXY } from "./konva-adapters"

export type ImageTx = { xPxU: MicroPx; yPxU: MicroPx; widthPxU: MicroPx; heightPxU: MicroPx }

export type TransformCommit = { xPxU?: MicroPx; yPxU?: MicroPx; widthPxU: MicroPx; heightPxU: MicroPx; rotationDeg: number }

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
  alignImage: (opts: { artW: number; artH: number; x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => void
  restoreImage: (opts: {
    artW: number
    artH: number
    baseW: number
    baseH: number
    initialImageTransform?: { xPxU?: MicroPx; yPxU?: MicroPx; widthPxU?: MicroPx; heightPxU?: MicroPx; rotationDeg: number } | null
  }) => void
}

export function createTransformController(deps: TransformControllerDeps): TransformController {
  let commitTimer: number | null = null
  let pending: { commitPosition: boolean } | null = null

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

  const scheduleCommit = (commitPosition: boolean, delayMs = 150) => {
    // Merge flags: never lose a previously requested position commit.
    pending = pending ? { commitPosition: pending.commitPosition || commitPosition } : { commitPosition }
    if (commitTimer != null) return
    commitTimer = globalThis.setTimeout(() => {
      commitTimer = null
      const p = pending
      pending = null
      if (!p) return
      commitFromNode(p.commitPosition)
    }, delayMs)
  }

  const dispose = () => {
    if (commitTimer != null) {
      globalThis.clearTimeout(commitTimer)
      commitTimer = null
    }
    pending = null
  }

  const rotate90 = () => {
    const next = (deps.getRotationDeg() + 90) % 360
    deps.setRotationDeg(next)
    const prev = deps.getImageTx()
    if (!prev) return
    deps.markUserChanged()
    deps.onCommit?.({ xPxU: prev.xPxU, yPxU: prev.yPxU, widthPxU: prev.widthPxU, heightPxU: prev.heightPxU, rotationDeg: next })
  }

  const setImageSize = (widthPxU: MicroPx, heightPxU: MicroPx, fallbackCenterPx?: { x: number; y: number } | null) => {
    if (widthPxU <= 0n || heightPxU <= 0n) return
    const prev = deps.getImageTx()
    const baseX = prev?.xPxU ?? (fallbackCenterPx ? numberToMicroPx(fallbackCenterPx.x) : (0n as MicroPx))
    const baseY = prev?.yPxU ?? (fallbackCenterPx ? numberToMicroPx(fallbackCenterPx.y) : (0n as MicroPx))
    const next: ImageTx = { xPxU: baseX, yPxU: baseY, widthPxU, heightPxU }
    const node = deps.getImageNode()
    if (node) applyMicroPxToNode(node, widthPxU, heightPxU)
    deps.markUserChanged()
    deps.setImageTx(next)
    deps.onCommit?.({ xPxU: next.xPxU, yPxU: next.yPxU, widthPxU: next.widthPxU, heightPxU: next.heightPxU, rotationDeg: deps.getRotationDeg() })
  }

  const alignImage = (opts: { artW: number; artH: number; x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => {
    const layer = deps.getLayer()
    const node = deps.getImageNode()
    if (!layer || !node) return
    const prev = deps.getImageTx()
    if (!prev) return
    const r = getClientRectRelative(node, layer)
    let dx = 0
    let dy = 0
    if (opts.x === "left") dx = 0 - r.x
    if (opts.x === "center") dx = opts.artW / 2 - (r.x + r.width / 2)
    if (opts.x === "right") dx = opts.artW - (r.x + r.width)
    if (opts.y === "top") dy = 0 - r.y
    if (opts.y === "center") dy = opts.artH / 2 - (r.y + r.height / 2)
    if (opts.y === "bottom") dy = opts.artH - (r.y + r.height)
    if (dx === 0 && dy === 0) return
    const { x: baseX, y: baseY } = getNodeXY(node)
    setNodeXY(node, baseX + dx, baseY + dy)
    const next: ImageTx = { xPxU: numberToMicroPx(baseX + dx), yPxU: numberToMicroPx(baseY + dy), widthPxU: prev.widthPxU, heightPxU: prev.heightPxU }
    deps.markUserChanged()
    deps.setImageTx(next)
    deps.onCommit?.({ xPxU: next.xPxU, yPxU: next.yPxU, widthPxU: next.widthPxU, heightPxU: next.heightPxU, rotationDeg: deps.getRotationDeg() })
  }

  const restoreImage = (opts: {
    artW: number
    artH: number
    baseW: number
    baseH: number
    initialImageTransform?: { xPxU?: MicroPx; yPxU?: MicroPx; widthPxU?: MicroPx; heightPxU?: MicroPx; rotationDeg: number } | null
  }) => {
    const t = opts.initialImageTransform ?? null
    const nextWidthPxU = t?.widthPxU ?? numberToMicroPx(opts.baseW)
    const nextHeightPxU = t?.heightPxU ?? numberToMicroPx(opts.baseH)
    const nextX = t?.xPxU ?? numberToMicroPx(opts.artW / 2)
    const nextY = t?.yPxU ?? numberToMicroPx(opts.artH / 2)

    const next: ImageTx = { xPxU: nextX, yPxU: nextY, widthPxU: nextWidthPxU, heightPxU: nextHeightPxU }

    const nextRotation = t ? Number(t.rotationDeg) : 0
    const rot = Number.isFinite(nextRotation) ? nextRotation : 0
    deps.setRotationDeg(rot)

    const node = deps.getImageNode()
    if (node) {
      applyMicroPxToNode(node, nextWidthPxU, nextHeightPxU)
      applyMicroPxPositionToNode(node, nextX, nextY)
    }
    deps.markUserChanged()
    deps.setImageTx(next)
    deps.onCommit?.({ xPxU: next.xPxU, yPxU: next.yPxU, widthPxU: next.widthPxU, heightPxU: next.heightPxU, rotationDeg: rot })
  }

  return { commitFromNode, scheduleCommit, dispose, rotate90, setImageSize, alignImage, restoreImage }
}

