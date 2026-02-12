/**
 * Editor workspace normalization helpers.
 *
 * Responsibilities:
 * - Normalize persisted workspace values (e.g. `unit`) into safe in-app values.
 */
import type { Unit } from "@/lib/editor/units"
import type { WorkspaceRow } from "./types"

export function normalizeUnit(u: unknown): Unit {
  if (u === "mm" || u === "cm" || u === "pt" || u === "px") return u
  return "cm"
}

export function normalizeWorkspaceRow(row: WorkspaceRow): WorkspaceRow {
  return { ...row, unit: normalizeUnit((row as unknown as { unit?: unknown })?.unit) }
}

