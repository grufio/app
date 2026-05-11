/**
 * Numerate-Wizard step validation + navigation.
 *
 * Lifted out of `numerate-wizard.tsx` so the rules can be unit-tested
 * without rendering a Dialog. Three things live here:
 *
 *   - `STEPS` — canonical ordered step list (single source of truth)
 *   - `stepValidity()` — per-step boolean validity from the draft +
 *     workspace dimensions
 *   - `canJumpTo()` — whether the user is allowed to click the target
 *     step indicator: stepping backward is always allowed, stepping
 *     forward requires every prior step to be valid
 *
 * Co-evolves with the upcoming numerate-wizard split (Plan R1).
 */
import type { NumerateParams } from "@/lib/editor/trace/numerate"

export type StepId = "grid" | "colors" | "output"

export const STEPS: ReadonlyArray<{ id: StepId; label: string }> = [
  { id: "grid", label: "Grid" },
  { id: "colors", label: "Colors" },
  { id: "output", label: "Output" },
]

export type WorkspaceDimensions = {
  widthPx: number | null
  heightPx: number | null
}

export function stepValidity(
  draft: NumerateParams,
  workspace: WorkspaceDimensions,
): Record<StepId, boolean> {
  return {
    grid: draft.superpixel_width >= 0.1 && draft.superpixel_height >= 0.1,
    colors:
      draft.stroke_width >= 0.1 &&
      draft.stroke_width <= 20 &&
      draft.num_colors >= 2 &&
      draft.num_colors <= 256,
    output: workspace.widthPx != null && workspace.heightPx != null,
  }
}

export function isFullyValid(validity: Record<StepId, boolean>): boolean {
  return validity.grid && validity.colors && validity.output
}

export function canJumpTo(
  target: StepId,
  active: StepId,
  validity: Record<StepId, boolean>,
): boolean {
  if (target === active) return true
  const targetIdx = STEPS.findIndex((s) => s.id === target)
  const activeIdx = STEPS.findIndex((s) => s.id === active)
  if (targetIdx < activeIdx) return true
  return STEPS.slice(0, targetIdx).every((s) => validity[s.id])
}
