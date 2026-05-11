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
  spacing_x_value: number
  spacing_y_value: number
  line_width_value: number
}

