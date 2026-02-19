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
import { clampPx, pxToUnit, type Unit } from "@/lib/editor/units"
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
  base: WorkspaceRow
}): { next: WorkspaceRow; signature: string } | { error: string } {
  const { base } = opts

  const wStr = String(opts.draftW).trim()
  const hStr = String(opts.draftH).trim()
  if (!wStr || !hStr) return { error: "Missing size" }

  const wNum = Number(wStr)
  const hNum = Number(hStr)
  if (!Number.isFinite(wNum) || !Number.isFinite(hNum)) return { error: "Invalid size" }

  const width_px = clampPx(wNum)
  const height_px = clampPx(hNum)
  const nextWPxU = BigInt(width_px) * 1_000_000n
  const nextHPxU = BigInt(height_px) * 1_000_000n

  const width_px_u = nextWPxU.toString()
  const height_px_u = nextHPxU.toString()

  const signature = `${base.project_id}:px:${width_px}:${height_px}`

  const next: WorkspaceRow = {
    ...base,
    // Output/display meta derived from canonical pixel geometry.
    width_value: pxToUnit(width_px, base.unit, base.output_dpi),
    height_value: pxToUnit(height_px, base.unit, base.output_dpi),
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
    next: {
      ...base,
      unit: nextUnit,
      // Output/display meta derived from canonical pixel geometry.
      width_value: pxToUnit(base.width_px, nextUnit, base.output_dpi),
      height_value: pxToUnit(base.height_px, nextUnit, base.output_dpi),
    },
    signature: `${base.project_id}:unit:${nextUnit}`,
  }
}

export function computeWorkspaceDpiChange(opts: {
  nextDpi: number
  nextPreset: WorkspaceRow["raster_effects_preset"]
  base: WorkspaceRow
}): { next: WorkspaceRow; signature: string } {
  const { base, nextDpi, nextPreset } = opts
  return {
    // Intentional DPI-only update: geometry fields are preserved.
    next: {
      ...base,
      output_dpi: nextDpi,
      // Deprecated bridge: keep DB `artboard_dpi` in sync until removed.
      artboard_dpi: nextDpi,
      // Output/display meta derived from canonical pixel geometry.
      width_value: pxToUnit(base.width_px, base.unit, nextDpi),
      height_value: pxToUnit(base.height_px, base.unit, nextDpi),
      raster_effects_preset: nextPreset ?? null,
    },
    signature: `${base.project_id}:dpi:${nextDpi}:${nextPreset ?? "custom"}`,
  }
}

