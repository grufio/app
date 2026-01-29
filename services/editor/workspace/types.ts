/**
 * Editor workspace types (UI-agnostic).
 *
 * Responsibilities:
 * - Define the persisted shape for `public.project_workspace` used by services/providers.
 */
import type { Unit } from "@/lib/editor/units"

export type WorkspaceRow = {
  project_id: string
  unit: Unit
  width_value: number
  height_value: number
  dpi_x: number
  dpi_y: number
  width_px_u: string
  height_px_u: string
  width_px: number
  height_px: number
  raster_effects_preset?: "high" | "medium" | "low" | null
  page_bg_enabled?: boolean
  page_bg_color?: string
  page_bg_opacity?: number
}

