/**
 * Pure helper for the master-delete dialog description.
 *
 * The "Delete image" dialog used to show a static line:
 *   "This will permanently delete the master image from storage…"
 *
 * Post master-delete-cascade (PR 2), the delete actually cascades
 * through every filter row and the trace overlay. The user asked
 * for that cascade to be explicit in the dialog so they know what
 * disappears when they confirm:
 *
 *   - no filter / no trace  → "delete the image and empty the project"
 *   - N filters             → "delete the image and N filters"
 *   - trace overlay         → "delete the image and the trace overlay"
 *   - both                  → "delete the image, N filters and the trace overlay"
 *
 * Pure function with no React deps so it lives next to the
 * components but is unit-testable from a plain `.test.ts`.
 */

export type DeleteMessageArgs = {
  cascadeFilterCount: number
  cascadeHasTrace: boolean
}

export function buildDeleteMessage(args: DeleteMessageArgs): string {
  const { cascadeFilterCount, cascadeHasTrace } = args
  if (cascadeFilterCount === 0 && !cascadeHasTrace) {
    return "This will permanently delete the image and empty the project."
  }
  const parts: string[] = []
  if (cascadeFilterCount > 0) {
    parts.push(`${cascadeFilterCount} filter${cascadeFilterCount === 1 ? "" : "s"}`)
  }
  if (cascadeHasTrace) parts.push("the trace overlay")
  return `This will permanently delete the image, ${parts.join(" and ")}.`
}

/**
 * Copy for the Reset confirm dialog. Reset removes the downstream artefact(s)
 * that lock a layer, KEEPING the layer itself (unlike delete):
 *   - image scope, filter + trace → "This removes the filter and the trace."
 *   - image scope, filter only    → "This removes the filter."
 *   - image scope, trace only     → "This removes the trace."
 *   - filter scope (always a trace) → "This removes the trace."
 * The image bar's reset removes the filter, which cascades the trace server-side;
 * the filter bar's reset removes only the trace.
 */
export type ResetScope = "image" | "filter"

export type ResetMessageArgs = {
  scope: ResetScope
  hasFilter: boolean
  hasTrace: boolean
}

export function buildResetTitle(args: ResetMessageArgs): string {
  const { scope, hasFilter, hasTrace } = args
  if (scope === "filter") return "Remove the trace?"
  if (hasFilter && hasTrace) return "Remove the filter and trace?"
  if (hasFilter) return "Remove the filter?"
  return "Remove the trace?"
}

export function buildResetMessage(args: ResetMessageArgs): string {
  const { scope, hasFilter, hasTrace } = args
  if (scope === "filter") return "This removes the trace."
  if (hasFilter && hasTrace) return "This removes the filter and the trace."
  if (hasFilter) return "This removes the filter."
  return "This removes the trace."
}
