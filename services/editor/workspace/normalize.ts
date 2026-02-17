/**
 * Editor workspace normalization helpers.
 *
 * Responsibilities:
 * - Normalize persisted workspace values (e.g. `unit`) into safe in-app values.
 */
import { normalizeUnit } from "@/services/editor/normalize-unit"
import type { WorkspaceRow } from "./types"

export { normalizeUnit }

export function normalizeWorkspaceRow(row: WorkspaceRow): WorkspaceRow {
  return { ...row, unit: normalizeUnit((row as unknown as { unit?: unknown })?.unit) }
}

