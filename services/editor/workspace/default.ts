/**
 * Default editor workspace (artboard) seed.
 *
 * Responsibilities:
 * - Produce a deterministic default `project_workspace` row when none exists.
 */
import { clampPx, pxUToPxNumber, type Unit, unitToPxUFixed } from "@/lib/editor/units"
import type { WorkspaceRow } from "./types"

export function defaultWorkspace(projectId: string): WorkspaceRow {
  // Default: 20x30cm @ 300dpi (Illustrator-like "new document")
  const unit: Unit = "cm"
  const width_value = 20
  const height_value = 30
  const dpi_x = 300
  const dpi_y = 300
  const output_dpi_x = 300
  const output_dpi_y = 300
  const widthPxU = unitToPxUFixed(String(width_value), unit)
  const heightPxU = unitToPxUFixed(String(height_value), unit)
  return {
    project_id: projectId,
    unit,
    width_value,
    height_value,
    dpi_x,
    dpi_y,
    output_dpi_x,
    output_dpi_y,
    raster_effects_preset: "high",
    width_px_u: widthPxU.toString(),
    height_px_u: heightPxU.toString(),
    width_px: clampPx(pxUToPxNumber(widthPxU)),
    height_px: clampPx(pxUToPxNumber(heightPxU)),
    page_bg_enabled: false,
    page_bg_color: "#ffffff",
    page_bg_opacity: 50,
  }
}

