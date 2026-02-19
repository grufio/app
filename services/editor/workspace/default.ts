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
  const output_dpi = 300
  const widthPxU = unitToPxU(String(width_value), unit, output_dpi)
  const heightPxU = unitToPxU(String(height_value), unit, output_dpi)
  return {
    project_id: projectId,
    unit,
    width_value,
    height_value,
    output_dpi,
    // Deprecated bridge: keep DB `artboard_dpi` in sync until removed.
    artboard_dpi: output_dpi,
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

