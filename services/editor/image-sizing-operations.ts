/**
 * Editor service: image sizing operations (UI-agnostic).
 *
 * Responsibilities:
 * - Keep commit decisions and aspect-lock ratio derivation out of React components.
 */
import type { Unit } from "@/lib/editor/units"
import { parseAndClampImageSize } from "./image-sizing"

export function computeLockedAspectRatioFromCurrentSize(args: {
  widthPxU?: bigint
  heightPxU?: bigint
}): { w: bigint; h: bigint } | null {
  const { widthPxU, heightPxU } = args
  if (!widthPxU || !heightPxU) return null
  if (widthPxU <= 0n || heightPxU <= 0n) return null
  return { w: widthPxU, h: heightPxU }
}

export function computeImageSizeCommit(args: {
  ready: boolean
  draftW: string
  draftH: string
  unit: Unit
}): { wPxU: bigint; hPxU: bigint } | null {
  if (!args.ready) return null
  return parseAndClampImageSize({ draftW: args.draftW, draftH: args.draftH, unit: args.unit })
}

