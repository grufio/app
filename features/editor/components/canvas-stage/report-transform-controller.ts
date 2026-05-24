"use client"

/**
 * Report-transform controller — feeds the authoritative display source
 * (`use-display-size`) from the canvas, but ONLY for real user edits.
 *
 * Why this exists (Invariant 1, the corruption channel it closes):
 *   The canvas holds a local `imageTx` that changes for TWO distinct
 *   reasons:
 *     1. A real user edit — drag / resize handle / align / fit / restore /
 *        position nudge. Each of those paths calls `markUserChanged()`
 *        immediately before its `setImageTx` (transform-controller.ts
 *        align/fit/restore/setImagePosition, select-controller.ts,
 *        selection-crop-controller.ts, and the keyboard handlers).
 *     2. A SYSTEM placement — the `useInitialImagePlacement` controller
 *        applying the persisted/seeded transform, or on a genuine fresh
 *        upload an intrinsic placement, or a re-placement inside the
 *        active-image reset window. Those go through `scheduleApply` and
 *        do NOT call `markUserChanged()`.
 *
 *   `use-display-size` says its source is fed ONLY by user-edit commits —
 *   "render / system / apply-refresh / re-placement never feed this".
 *   But the report effect that backs `onImageTransformChange` fired on
 *   EVERY `imageTx` change. So a system placement (e.g. the fresh-upload
 *   intrinsic, or a re-placement during an active-image reset window where
 *   the seed had not yet threaded through) reported the source-bitmap
 *   intrinsic UP into `displayTxU`, overwriting the persisted/re-seeded
 *   display size. The image then rendered at the source-bitmap intrinsic
 *   (1254×1254) instead of the set display size (283×567), and any
 *   consumer of `displayTxU` (the canvas image layer, the trace dialog
 *   size, the legacy trace-overlay fallback, the right-panel readout)
 *   inherited the corruption. `use-display-size`'s value-equality
 *   short-circuit does NOT help here: the intrinsic differs from the seed,
 *   so it is not a no-op re-report — it is a destructive overwrite.
 *
 * The discriminator: `hasUserChanged()`. It is true iff a user-edit path
 * called `markUserChanged()` since the last `resetForNewImage()` (which
 * fires per active-image so a post-apply re-placement is correctly treated
 * as a system change). Gating the report on it makes the
 * "system never feeds the source" invariant hold at the boundary instead
 * of relying on it being true by luck of mount timing.
 *
 * Framework-agnostic predicate (pure, unit-tested) + the React effect
 * wrapper. The predicate is the gate; the effect just wires `imageTx` to
 * it.
 */
import { useEffect, type MutableRefObject } from "react"

type ImageTx = { xPxU: bigint; yPxU: bigint; widthPxU: bigint; heightPxU: bigint } | null

type UserEditGuard = {
  hasUserChanged: () => boolean
}

/**
 * Should this `imageTx` be reported up to the authoritative display
 * source? Only when it originates from a real user edit.
 */
export function shouldReportImageTransform(guard: UserEditGuard): boolean {
  return guard.hasUserChanged()
}

/**
 * Report `imageTx` to the parent after state commits, gated so only real
 * user-edit commits feed the authoritative display source. System
 * placements (initial-placement, restore, active-image reset) set
 * `imageTx` without `markUserChanged()`, so they are not reported and
 * cannot clobber the persisted/seeded display size.
 */
export function useReportTransformOnUserEdit(args: {
  imageTx: ImageTx
  guardRef: MutableRefObject<UserEditGuard>
  report: (tx: ImageTx) => void
}) {
  const { imageTx, guardRef, report } = args
  useEffect(() => {
    // Do NOT call inside state updaters — triggers "Cannot update a
    // component while rendering a different component".
    if (!shouldReportImageTransform(guardRef.current)) return
    report(imageTx)
  }, [imageTx, guardRef, report])
}
