import type { WorkflowSourceStatus } from "@/lib/editor/machines/image-workflow.types"

/**
 * Single "is there an editable image on the Image section?" signal.
 *
 * The canvas shows a photo whenever the workflow source is `ready` (the filter
 * working-copy exists), which can be true even while `workflow.master` is
 * transiently null (a signed-URL failure / `exists:false` / cold load). Gating
 * the Add-vs-Edit affordances on `master` alone then diverges from the canvas —
 * the photo and the "Add image" button show at the same time.
 *
 * Deriving the gate from the SAME source status the canvas uses (OR a present
 * master, to avoid a flash of "Add" while the source is still loading) keeps
 * "photo present" and "Add image" mutually exclusive.
 */
export function deriveHasEditableImage(args: {
  sourceStatus: WorkflowSourceStatus
  hasMaster: boolean
}): boolean {
  return args.sourceStatus === "ready" || args.hasMaster
}
