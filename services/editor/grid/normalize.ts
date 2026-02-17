/**
 * Editor grid normalization helpers.
 */
import { normalizeUnit } from "@/services/editor/normalize-unit"
import type { ProjectGridRow } from "./types"

export { normalizeUnit }

export function normalizeHexColor(input: unknown): string {
  if (typeof input !== "string") return "#000000"
  const s = input.trim()
  const m = /^#([0-9a-fA-F]{6})$/.exec(s)
  if (!m) return "#000000"
  return `#${m[1].toLowerCase()}`
}

export function normalizeProjectGridRow(row: ProjectGridRow): ProjectGridRow {
  return {
    ...row,
    unit: normalizeUnit((row as unknown as { unit?: unknown })?.unit),
    color: normalizeHexColor((row as unknown as { color?: unknown })?.color),
  }
}

