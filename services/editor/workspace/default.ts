/**
 * Default editor workspace (artboard) seed.
 *
 * Responsibilities:
 * - Produce a deterministic default `project_workspace` row when none exists.
 */
import { clampPx, pxUToPxNumber, type Unit, unitToPxU } from "@/lib/editor/units"
import type { WorkspaceRow } from "./types"

export function defaultWorkspace(projectId: string): WorkspaceRow {
  // Default: 20x30cm @ 300dpi (Illustrator-like "new document")
  const unit: Unit = "cm"
  const width_value = 20
  const height_value = 30
  const dpi_x = 300
  const dpi_y = 300
  const widthPxU = unitToPxU(String(width_value), unit, dpi_x)
  const heightPxU = unitToPxU(String(height_value), unit, dpi_y)
  return {
    project_id: projectId,
    unit,
    width_value,
    height_value,
    dpi_x,
    dpi_y,
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

