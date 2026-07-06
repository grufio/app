/**
 * Editor workspace normalization + parsing helpers.
 *
 * Responsibilities:
 * - Validate a raw PostgREST row at the persistence boundary (fail LOUD on
 *   schema drift instead of silently coercing to NaN/undefined downstream).
 * - Normalize persisted values (e.g. `unit`) into safe in-app values.
 */
import { z } from "zod"

import { normalizeUnit } from "@/services/editor/normalize-unit"
import type { WorkspaceRow } from "./types"

export { normalizeUnit }

// Load-bearing columns are NOT NULL in `project_workspace`; validate them
// strictly so a schema drift is caught HERE (one boundary) rather than
// producing NaN/undefined in the canvas geometry. Optional page-bg / padding
// fields pass through untouched.
const workspaceRowShape = z.object({
  project_id: z.string(),
  unit: z.string(),
  width_value: z.number(),
  height_value: z.number(),
  width_px_u: z.string(),
  height_px_u: z.string(),
  width_px: z.number(),
  height_px: z.number(),
})

export function normalizeWorkspaceRow(row: WorkspaceRow): WorkspaceRow {
  return { ...row, unit: normalizeUnit(row.unit) }
}

/**
 * Parse a raw PostgREST row (`unknown` from the Supabase client) into a
 * validated, normalized `WorkspaceRow`. Throws on shape drift; returns `null`
 * for a null/absent row. This is the single place the DB→app type bridge is
 * crossed for the workspace row — repositories call it instead of casting.
 */
export function parseWorkspaceRow(data: unknown): WorkspaceRow | null {
  if (data == null) return null
  const check = workspaceRowShape.safeParse(data)
  if (!check.success) {
    throw new Error(`project_workspace row shape drift: ${check.error.message}`)
  }
  return normalizeWorkspaceRow(data as WorkspaceRow)
}
