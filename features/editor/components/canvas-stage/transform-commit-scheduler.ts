/**
 * Debounced commit scheduler for transform mutations.
 *
 * Coalesces a burst of resize/rotate/drag events into a single
 * `onFlush` call after `delayMs` of quiescence. Drag-end and rotate
 * call `schedule(true, …)` to force a position commit; size-only
 * paths call `schedule(false, …)`.
 *
 * Sticky-true OR-merge: while a flush is pending, repeated calls to
 * `schedule(commitPosition, …)` OR the incoming `commitPosition` into
 * the pending value. Once any caller has requested a position commit,
 * the eventual flush will commit position regardless of later callers
 * passing `false`. This is intentional — a drag-end (`true`) followed
 * by an inflight resize tick (`false`) must still commit the post-drag
 * position. See `placement-controller.ts` for the call sites.
 */
export type CommitScheduler = {
  cancel: () => void
  schedule: (commitPosition: boolean, delayMs?: number) => void
}

export function createCommitScheduler(onFlush: (commitPosition: boolean) => void): CommitScheduler {
  let commitTimer: ReturnType<typeof setTimeout> | null = null
  let pending: { commitPosition: boolean } | null = null

  const cancel = () => {
    if (commitTimer != null) {
      globalThis.clearTimeout(commitTimer)
      commitTimer = null
    }
    pending = null
  }

  const schedule = (commitPosition: boolean, delayMs = 150) => {
    // Sticky-true OR-merge: once any scheduled call has asked for a
    // position commit, it stays sticky until flush. See type-doc above.
    pending = pending ? { commitPosition: pending.commitPosition || commitPosition } : { commitPosition }
    if (commitTimer != null) {
      globalThis.clearTimeout(commitTimer)
      commitTimer = null
    }
    commitTimer = globalThis.setTimeout(() => {
      commitTimer = null
      const p = pending
      pending = null
      if (!p) return
      onFlush(p.commitPosition)
    }, delayMs)
  }

  return { cancel, schedule }
}
