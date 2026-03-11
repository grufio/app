import type Konva from "konva"

import type { MicroPx } from "@/lib/editor/imageState"
import { numberToMicroPx } from "@/lib/editor/konva"

import { getClientRectRelative, getNodeXY, setNodeXY } from "./konva-adapters"
import type { ImagePlacementPx } from "./placement"
import type { AlignImageOpts, ImageTx } from "./transform-types"

export function resolveBasePositionMicroPx(args: {
  prev: ImageTx | null
  fallbackCenterPx?: { x: number; y: number } | null
}): { xPxU: MicroPx; yPxU: MicroPx } {
  const { prev, fallbackCenterPx } = args
  const xPxU = prev?.xPxU ?? (fallbackCenterPx ? numberToMicroPx(fallbackCenterPx.x) : (0n as MicroPx))
  const yPxU = prev?.yPxU ?? (fallbackCenterPx ? numberToMicroPx(fallbackCenterPx.y) : (0n as MicroPx))
  return { xPxU, yPxU }
}

export function buildRestoreImageTx(placement: ImagePlacementPx): ImageTx {
  return {
    xPxU: numberToMicroPx(placement.xPx),
    yPxU: numberToMicroPx(placement.yPx),
    widthPxU: numberToMicroPx(placement.widthPx),
    heightPxU: numberToMicroPx(placement.heightPx),
  }
}

export function alignNodeAndBuildImageTx(args: {
  node: Konva.Image
  layer: Konva.Layer
  prev: ImageTx
  opts: AlignImageOpts
}): ImageTx | null {
  const { node, layer, prev, opts } = args
  const r = getClientRectRelative(node, layer)
  let dx = 0
  let dy = 0
  if (opts.x === "left") dx = 0 - r.x
  if (opts.x === "center") dx = opts.artW / 2 - (r.x + r.width / 2)
  if (opts.x === "right") dx = opts.artW - (r.x + r.width)
  if (opts.y === "top") dy = 0 - r.y
  if (opts.y === "center") dy = opts.artH / 2 - (r.y + r.height / 2)
  if (opts.y === "bottom") dy = opts.artH - (r.y + r.height)
  if (dx === 0 && dy === 0) return null

  const { x: baseX, y: baseY } = getNodeXY(node)
  setNodeXY(node, baseX + dx, baseY + dy)

  return {
    xPxU: numberToMicroPx(baseX + dx),
    yPxU: numberToMicroPx(baseY + dy),
    widthPxU: prev.widthPxU,
    heightPxU: prev.heightPxU,
  }
}
