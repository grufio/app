import { PX_U_SCALE, clampPx, pxUToPxNumber, pxUToUnitDisplay, type Unit, unitToPxU } from "@/lib/editor/units"
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
  dpi: number
}): { widthDraft: string; heightDraft: string } {
  const { widthPxU, heightPxU, widthPx, heightPx, unit, dpi } = args
  const wU = toCanonicalPxU(widthPxU, widthPx)
  const hU = toCanonicalPxU(heightPxU, heightPx)
  return {
    widthDraft: pxUToUnitDisplay(wU, unit, dpi),
    heightDraft: pxUToUnitDisplay(hU, unit, dpi),
  }
}

export function computeWorkspaceSizeSaveFromDisplay(args: {
  base: WorkspaceRow
  draftW: string
  draftH: string
  unit: Unit
  dpi: number
}): { next: WorkspaceRow; signature: string } | { error: string } {
  const { base, draftW, draftH, unit, dpi } = args
  try {
    const wU = unitToPxU(String(draftW).trim(), unit, dpi)
    const hU = unitToPxU(String(draftH).trim(), unit, dpi)
    const widthPx = clampPx(pxUToPxNumber(wU))
    const heightPx = clampPx(pxUToPxNumber(hU))
    const width_px_u = wU.toString()
    const height_px_u = hU.toString()
    return {
      next: {
        ...base,
        width_value: Number(pxUToUnitDisplay(wU, base.unit, base.output_dpi)),
        height_value: Number(pxUToUnitDisplay(hU, base.unit, base.output_dpi)),
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

