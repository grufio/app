/**
 * Project defaults (UI-agnostic).
 *
 * Responsibilities:
 * - Centralize default project/workspace values so pages/dialogs don't diverge.
 */
import type { Unit } from "@/lib/editor/units"

export const DEFAULT_PROJECT_CREATE_INPUT: {
  name: string
  unit: Unit
  width_value: number
  height_value: number
  dpi: number
} = {
  // Default Artboard (workspace): 20x30cm @ 300dpi
  name: "Untitled",
  unit: "cm",
  width_value: 20,
  height_value: 30,
  dpi: 300,
}

