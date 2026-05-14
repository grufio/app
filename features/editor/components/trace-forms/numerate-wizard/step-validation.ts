/**
 * Numerate-Wizard step validation + navigation.
 *
 * Lifted out of `numerate-wizard.tsx` so the rules can be unit-tested
 * without rendering a Dialog. Three things live here:
 *
 *   - `STEPS` — canonical ordered step list (single source of truth)
 *   - `stepValidity()` — per-step boolean validity from the draft +
 *     wizard context (source image dims + workspace dims)
 *   - `canJumpTo()` — whether the user is allowed to click the target
 *     step indicator: stepping backward is always allowed, stepping
 *     forward requires every prior step to be valid
 *
 * The grid step is invalid — and Apply stays hard-blocked — until the
 * supercell meets `MIN_SUPERCELL_MM` and the resolved grid has at
 * least one whole cell on each axis.
 */
import type { NumerateParams } from "@/lib/editor/trace/numerate"
import {
  MIN_SUPERCELL_MM,
  isNumerateGridValid,
  resolveNumerateGrid,
} from "@/lib/editor/trace/numerate-grid-math"

export type StepId = "grid" | "colors" | "output"

export const STEPS: ReadonlyArray<{ id: StepId; label: string }> = [
  { id: "grid", label: "Grid" },
  { id: "colors", label: "Colors" },
  { id: "output", label: "Output" },
]

export type WizardContext = {
  /** Source image dimensions (px) — needed to resolve the grid. */
  imageWidth: number
  imageHeight: number
  /** Project artboard dimensions (px) — `null` while the workspace
   * is still loading; the `output` step blocks Apply until set. */
  workspaceWidthPx: number | null
  workspaceHeightPx: number | null
}

export function stepValidity(
  draft: NumerateParams,
  ctx: WizardContext,
): Record<StepId, boolean> {
  const grid = resolveNumerateGrid(ctx.imageWidth, ctx.imageHeight, draft)
  return {
    grid:
      draft.supercell_mm >= MIN_SUPERCELL_MM &&
      draft.multiple >= 1 &&
      draft.primary_count >= 1 &&
      isNumerateGridValid(grid),
    colors:
      draft.stroke_width >= 0.1 &&
      draft.stroke_width <= 20 &&
      draft.num_colors >= 2 &&
      draft.num_colors <= 256,
    output: ctx.workspaceWidthPx != null && ctx.workspaceHeightPx != null,
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
