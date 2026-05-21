/**
 * Canvas-image persistence whitelist.
 *
 * `project_image_state` is anchored at `master.id` (PR #124 invariant);
 * the row reflects the master's display transform on the artboard. The
 * canvas may render other bitmaps too — `working_copy`,
 * `filter_working_copy`, `trace_base` — but only the master and its
 * direct visual derivatives (working copies + filter chain tip) share
 * the master's intrinsic dimensions, so only their transform commits
 * are safe to persist into the master-anchored state row.
 *
 * Persisting a non-master commit silently overwrites the master's
 * transform. PR #246 prevented this for the obvious trigger (Trace-tab
 * drag) via a UI gate, but the apply-trace race-closure pre-step in
 * `useTraceHandlers` was still able to commit `trace_base` dims into
 * the master row. This helper centralises the check so every save path
 * is covered.
 */

export type CanvasPersistenceGateArgs = {
  canvasImageId: string | null
  masterImageId: string | null
  /** The trace-free filter chain tip — `working_copy` (no filters) or
   * the latest `filter_working_copy`. Shares the master's intrinsic
   * dims, so transform commits are safe to persist. */
  filterDisplayImageWithoutTraceId: string | null
}

/**
 * @returns `true` when the currently-rendered canvas image is the
 * master or one of its direct visual derivatives — i.e. when a
 * transform commit reflects the master's state and is safe to write to
 * the master-anchored `project_image_state` row.
 *
 * Returns `false` (silent skip) for any other canvas-image id: trace
 * bitmaps, future per-image-state targets, or null inputs (canvas not
 * ready yet).
 */
export function shouldPersistCanvasTransform(args: CanvasPersistenceGateArgs): boolean {
  if (!args.canvasImageId || !args.masterImageId) return false
  return (
    args.canvasImageId === args.masterImageId ||
    args.canvasImageId === args.filterDisplayImageWithoutTraceId
  )
}
