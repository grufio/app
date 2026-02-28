/**
 * Default editor grid seed.
 */
import type { Unit } from "@/lib/editor/units"
import type { ProjectGridRow } from "./types"

export function defaultGrid(projectId: string, unit: Unit): ProjectGridRow {
  return {
    project_id: projectId,
    unit,
    color: "#000000",
    spacing_value: 10,
    spacing_x_value: 10,
    spacing_y_value: 10,
    // Repurpose legacy column as opacity carrier (0..100) while render width stays fixed at 1px.
    line_width_value: 100,
  }
}

