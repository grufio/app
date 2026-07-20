import type { WorkflowSourceStatus } from "@/lib/editor/machines/image-workflow.types"

/**
 * Tri-state for the Image section's top-right bar, derived from the SAME source
 * read-model status the canvas uses (`deriveSource`, which already folds in
 * `masterLoading` + `filter.loadedOnce`). This is the standard the Filter/Trace
 * sections follow: the source distinguishes `"loading"` (state unknown) from a
 * confirmed `"empty"`, so "Add" is only ever offered once it's KNOWN there is no
 * image — never during the initial load.
 *
 *   - "edit"    → an image is present (source `ready`, or an SSR-seeded master):
 *                 show Edit/Delete immediately.
 *   - "pending" → the source is still `loading` (unknown): show nothing, so the
 *                 bar can't flash "Add" for ~500ms before the real controls.
 *   - "add"     → a confirmed empty/error state with no master: offer "Add".
 *
 * The `|| hasMaster` term keeps the best case (SSR master present) instant on
 * "edit" without waiting for the working-copy fetch.
 */
export type ImageBarMode = "edit" | "add" | "pending"

export function deriveImageBarMode(args: {
  sourceStatus: WorkflowSourceStatus
  hasMaster: boolean
}): ImageBarMode {
  if (args.sourceStatus === "ready" || args.hasMaster) return "edit"
  if (args.sourceStatus === "loading") return "pending"
  return "add"
}
