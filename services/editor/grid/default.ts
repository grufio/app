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
    // Opacity carrier (0..100) for fixed 1px grid hairline rendering.
    line_width_value: 100,
  }
}

