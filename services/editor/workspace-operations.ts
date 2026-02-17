/**
 * Editor service: workspace operations (UI-agnostic).
 *
 * Responsibilities:
 * - Compute deterministic `project_workspace` updates from UI draft inputs.
 * - Centralize unit/DPI preset normalization and save signatures.
 *
 * Notes:
 * - This module is pure (no React/DOM, no Supabase).
 * - It intentionally mirrors existing UI behavior; changes should be covered by tests.
 */
import { clampPx, pxUToPxNumber, type Unit, unitToPxU } from "@/lib/editor/units"
import { normalizeUnit } from "./normalize-unit"
import type { WorkspaceRow } from "./workspace/types"

export { normalizeUnit }

export type RasterPreset = "high" | "medium" | "low"

/**
 * Raster preset mapping used by the UI: exact DPI presets.
 * - 300 -> high
 * - 150 -> medium
 * - 72  -> low
 * - otherwise: null (custom)
 */
export function mapDpiToRasterPreset(dpi: number): RasterPreset | null {
  if (dpi === 300) return "high"
  if (dpi === 150) return "medium"
  if (dpi === 72) return "low"
  return null
}

export function computeLockedDimension(opts: {
  changedValue: number
  ratio: number
  changedAxis: "w" | "h"
}): number | null {
  const { changedValue, ratio, changedAxis } = opts
  if (!Number.isFinite(changedValue) || changedValue <= 0) return null
  if (!Number.isFinite(ratio) || ratio <= 0) return null
  if (changedAxis === "w") return changedValue / ratio
  return changedValue * ratio
}

export function computeWorkspaceSizeSave(opts: {
  draftW: string
  draftH: string
  unit: Unit
  base: WorkspaceRow
}): { next: WorkspaceRow; signature: string } | { error: string } {
  const { base, unit } = opts

  const wStr = String(opts.draftW).trim()
  const hStr = String(opts.draftH).trim()
  if (!wStr || !hStr) return { error: "Missing size" }

  let nextWPxU: bigint
  let nextHPxU: bigint
  try {
    nextWPxU = unitToPxU(wStr, unit, base.artboard_dpi)
    nextHPxU = unitToPxU(hStr, unit, base.artboard_dpi)
  } catch {
    return { error: "Invalid size" }
  }

  const width_px_u = nextWPxU.toString()
  const height_px_u = nextHPxU.toString()
  const width_px = clampPx(pxUToPxNumber(nextWPxU))
  const height_px = clampPx(pxUToPxNumber(nextHPxU))

  const signature = `${base.project_id}:${unit}:${nextWPxU}:${nextHPxU}`

  const next: WorkspaceRow = {
    ...base,
    unit,
    width_value: Number(wStr),
    height_value: Number(hStr),
    width_px_u,
    height_px_u,
    width_px,
    height_px,
  }

  return { next, signature }
}

export function computeWorkspaceUnitChange(opts: {
  nextUnit: Unit
  base: WorkspaceRow
}): { next: WorkspaceRow; signature: string } {
  const { base, nextUnit } = opts
  return {
    next: { ...base, unit: nextUnit },
    signature: `${base.project_id}:unit:${nextUnit}`,
  }
}

