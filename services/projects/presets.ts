/**
 * Project creation presets (UI-agnostic).
 *
 * Responsibilities:
 * - Provide the canonical list of artboard presets and allowed DPI options.
 * - Keep preset grouping logic out of UI components.
 */
import type { Unit } from "@/lib/editor/units"

export type ProjectPreset = {
  id: string
  label: string
  unit: Unit
  width_value: number
  height_value: number
  group: "print" | "web"
}

export const PROJECT_PRESETS: ProjectPreset[] = [
  { id: "print-a4", label: "A4 (210 × 297 mm)", unit: "mm", width_value: 210, height_value: 297, group: "print" },
  { id: "print-a3", label: "A3 (297 × 420 mm)", unit: "mm", width_value: 297, height_value: 420, group: "print" },
  { id: "web-1920x1080", label: "Web 1920 × 1080 px", unit: "px", width_value: 1920, height_value: 1080, group: "web" },
  { id: "web-1280x720", label: "Web 1280 × 720 px", unit: "px", width_value: 1280, height_value: 720, group: "web" },
  { id: "web-1080x1080", label: "Web 1080 × 1080 px", unit: "px", width_value: 1080, height_value: 1080, group: "web" },
]

export const PROJECT_DPI_OPTIONS = [300, 150, 72] as const

export function getProjectPresetById(presetId: string): ProjectPreset | null {
  return PROJECT_PRESETS.find((p) => p.id === presetId) ?? null
}

export function getProjectPresetsByGroup(group: ProjectPreset["group"]): ProjectPreset[] {
  return PROJECT_PRESETS.filter((p) => p.group === group)
}

