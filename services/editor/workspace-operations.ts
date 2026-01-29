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
import type { WorkspaceRow } from "./workspace/types"

export function normalizeUnit(u: unknown): Unit {
  if (u === "mm" || u === "cm" || u === "pt" || u === "px") return u
  return "cm"
}

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
  dpi: number
  base: WorkspaceRow
}): { next: WorkspaceRow; signature: string } | { error: string } {
  const { base, unit } = opts
  const dpi = Number(opts.dpi)
  if (!Number.isFinite(dpi) || dpi <= 0) return { error: "Invalid dpi" }

  const wStr = String(opts.draftW).trim()
  const hStr = String(opts.draftH).trim()
  if (!wStr || !hStr) return { error: "Missing size" }

  let nextWPxU: bigint
  let nextHPxU: bigint
  try {
    nextWPxU = unitToPxU(wStr, unit, dpi)
    nextHPxU = unitToPxU(hStr, unit, dpi)
  } catch {
    return { error: "Invalid size" }
  }

  const width_px_u = nextWPxU.toString()
  const height_px_u = nextHPxU.toString()
  const width_px = clampPx(pxUToPxNumber(nextWPxU))
  const height_px = clampPx(pxUToPxNumber(nextHPxU))

  // Preserve the existing UI signature semantics (even though raster preset is computed from dpi).
  const signature = `${base.project_id}:${unit}:${nextWPxU}:${nextHPxU}:${dpi}:${base.raster_effects_preset ?? ""}`

  const next: WorkspaceRow = {
    ...base,
    unit,
    dpi_x: dpi,
    dpi_y: dpi,
    width_value: Number(wStr),
    height_value: Number(hStr),
    width_px_u,
    height_px_u,
    width_px,
    height_px,
    raster_effects_preset: mapDpiToRasterPreset(dpi),
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

