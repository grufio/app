/**
 * Editor grid types (UI-agnostic).
 *
 * Responsibilities:
 * - Define the persisted shape for `public.project_grid`.
 */
import type { Unit } from "@/lib/editor/units"

export type ProjectGridRow = {
  project_id: string
  color: string
  unit: Unit
  // Legacy single-axis spacing column (still NOT NULL in DB).
  // Keep it in sync with spacing_x_value to satisfy constraints.
  spacing_value: number
  spacing_x_value: number
  spacing_y_value: number
  line_width_value: number
}

