/**
 * Editor grid normalization helpers.
 */
import type { Unit } from "@/lib/editor/units"
import type { ProjectGridRow } from "./types"

export function normalizeUnit(u: unknown): Unit {
  if (u === "mm" || u === "cm" || u === "pt" || u === "px") return u
  return "cm"
}

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

