/**
 * Editor service: grid operations (UI-agnostic).
 *
 * Responsibilities:
 * - Compute deterministic upsert rows for `project_grid`.
 * - Provide stable save signatures for deduplication/coalescing.
 */
import type { ProjectGridRow } from "./types"

export function computeGridSaveSignature(row: ProjectGridRow): string {
  return `${row.project_id}:${row.unit}:${row.spacing_x_value}:${row.spacing_y_value}:${row.line_width_value}:${row.color}`
}

export function computeGridUpsert(
  next: ProjectGridRow,
  base: ProjectGridRow
): { next: ProjectGridRow; signature: string } {
  // Keep legacy NOT NULL `spacing_value` consistent with x spacing.
  const spacingX = Number.isFinite(next.spacing_x_value) ? next.spacing_x_value : base.spacing_x_value
  const merged: ProjectGridRow = {
    ...base,
    ...next,
    spacing_x_value: spacingX,
    spacing_value: spacingX,
  }

  return { next: merged, signature: computeGridSaveSignature(merged) }
}

