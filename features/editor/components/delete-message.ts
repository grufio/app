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
