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
  width_px_u: string
  height_px_u: string
  width_px: number
  height_px: number
  page_bg_enabled?: boolean
  page_bg_color?: string
  page_bg_opacity?: number
  // Print-margin padding per side, canonical in µpx (BigInt-as-text). Distance
  // from the image area to the page. `NOT NULL DEFAULT '0'` in the DB.
  padding_top_px_u?: string
  padding_bottom_px_u?: string
  padding_left_px_u?: string
  padding_right_px_u?: string
}

