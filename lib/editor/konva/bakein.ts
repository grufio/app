/**
 * Konva node µpx helpers.
 *
 * Responsibilities:
 * - Convert between Konva node width/height/position and canonical µpx values.
 * - Bake node scale into size deterministically and reset scale to 1.
 */
import { PX_U_SCALE, pxUToPxNumber } from "@/lib/editor/units"
import type { MicroPx } from "@/lib/editor/imageState"
import { clampMicroPx as clampMicroPxShared } from "@/lib/editor/imageState"

export type SizeNodeLike = {
  width(): number
  height(): number
  scaleX(): number
  scaleY(): number
  width(v: number): unknown
  height(v: number): unknown
  scaleX(v: number): unknown
  scaleY(v: number): unknown
}

export type PositionNodeLike = {
  x(): number
  y(): number
  x(v: number): unknown
  y(v: number): unknown
}

const PX_U_SCALE_NUMBER = Number(PX_U_SCALE)

export function numberToMicroPx(px: number): MicroPx {
  return BigInt(Math.round(px * PX_U_SCALE_NUMBER)) as MicroPx
}

export const clampMicroPx = clampMicroPxShared

/**
 * Bake transient node scale into width/height in µpx.
 * - Computes: newW_u = round(width * scaleX * 1e6), newH_u = round(height * scaleY * 1e6)
 * - Clamps to [1px..MAX_PX_U]
 * - Applies: node.width(newW), node.height(newH), node.scaleX(1), node.scaleY(1)
 *
 * Invariants: see docs/specs/sizing-invariants.mdx
 */
export function bakeInSizeToMicroPx(node: SizeNodeLike): { widthPxU: MicroPx; heightPxU: MicroPx } {
  const widthPxU = clampMicroPx(numberToMicroPx(node.width() * node.scaleX()))
  const heightPxU = clampMicroPx(numberToMicroPx(node.height() * node.scaleY()))

  node.width(pxUToPxNumber(widthPxU))
  node.height(pxUToPxNumber(heightPxU))
  node.scaleX(1)
  node.scaleY(1)

  return { widthPxU, heightPxU }
}

/**
 * Apply canonical µpx size to node (steady state).
 * Sets width/height and forces scale back to 1.
 */
export function applyMicroPxToNode(node: SizeNodeLike, widthPxU: MicroPx, heightPxU: MicroPx): void {
  const w = pxUToPxNumber(clampMicroPx(widthPxU))
  const h = pxUToPxNumber(clampMicroPx(heightPxU))
  node.width(w)
  node.height(h)
  node.scaleX(1)
  node.scaleY(1)
}

export function readMicroPxPositionFromNode(node: PositionNodeLike): { xPxU: MicroPx; yPxU: MicroPx } {
  return { xPxU: numberToMicroPx(node.x()), yPxU: numberToMicroPx(node.y()) }
}

export function applyMicroPxPositionToNode(node: PositionNodeLike, xPxU: MicroPx, yPxU: MicroPx): void {
  node.x(pxUToPxNumber(xPxU))
  node.y(pxUToPxNumber(yPxU))
}

