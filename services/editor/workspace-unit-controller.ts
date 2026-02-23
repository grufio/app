import { PX_U_SCALE, clampPx, pxUToPxNumber, pxUToUnitDisplayFixed, type Unit, unitToPxUFixed } from "@/lib/editor/units"
import type { WorkspaceRow } from "./workspace/types"

function toCanonicalPxU(rawPxU: bigint | null | undefined, fallbackPx: number): bigint {
  if (typeof rawPxU === "bigint" && rawPxU > 0n) return rawPxU
  return BigInt(clampPx(fallbackPx)) * PX_U_SCALE
}

export function getDisplaySizeDraft(args: {
  widthPxU: bigint | null | undefined
  heightPxU: bigint | null | undefined
  widthPx: number
  heightPx: number
  unit: Unit
}): { widthDraft: string; heightDraft: string } {
  const { widthPxU, heightPxU, widthPx, heightPx, unit } = args
  const wU = toCanonicalPxU(widthPxU, widthPx)
  const hU = toCanonicalPxU(heightPxU, heightPx)
  return {
    widthDraft: pxUToUnitDisplayFixed(wU, unit),
    heightDraft: pxUToUnitDisplayFixed(hU, unit),
  }
}

export function computeWorkspaceSizeSaveFromDisplay(args: {
  base: WorkspaceRow
  draftW: string
  draftH: string
  unit: Unit
}): { next: WorkspaceRow; signature: string } | { error: string } {
  const { base, draftW, draftH, unit } = args
  try {
    const wU = unitToPxUFixed(String(draftW).trim(), unit)
    const hU = unitToPxUFixed(String(draftH).trim(), unit)
    const widthPx = clampPx(pxUToPxNumber(wU))
    const heightPx = clampPx(pxUToPxNumber(hU))
    const width_px_u = wU.toString()
    const height_px_u = hU.toString()
    return {
      next: {
        ...base,
        width_value: Number(pxUToUnitDisplayFixed(wU, base.unit)),
        height_value: Number(pxUToUnitDisplayFixed(hU, base.unit)),
        width_px_u,
        height_px_u,
        width_px: widthPx,
        height_px: heightPx,
      },
      signature: `${base.project_id}:pxu:${width_px_u}:${height_px_u}`,
    }
  } catch {
    return { error: "Invalid size" }
  }
}

