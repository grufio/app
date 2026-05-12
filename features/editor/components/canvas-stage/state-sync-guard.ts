/**
 * Persisted-vs-user state sequencing guard (pure).
 *
 * Purpose:
 * - Prevent persisted state (late arriving from network) from
 *   overriding user edits that landed in between.
 * - Allow "latest scheduled apply wins" semantics for persisted
 *   applies — if SSR already scheduled a default placement and then
 *   the persisted state arrives, the persisted apply cancels the
 *   default apply via the sequence-number bump.
 *
 * Mechanism:
 * - `pendingApplySeq` increments on every schedule. The microtask
 *   only runs if its captured seq still matches — older queued
 *   applies are no-ops.
 * - `userMutationSeq` increments on every `markUserChanged()`. The
 *   microtask also checks the captured user-seq snapshot — if the
 *   user moved the canvas between schedule and flush, the apply is
 *   skipped.
 *
 * Important ordering: both sequence snapshots are captured **before**
 * `appliedKey` is mutated. If `markUserChanged()` were to race with
 * `scheduleApply()`, capturing after the `appliedKey` write could
 * miss a concurrent user-mutation and apply a stale persisted state
 * over the user's edit.
 *
 * UI-framework-agnostic so it can be unit-tested without React.
 */
export function createStateSyncGuard() {
  let appliedKey: string | null = null
  let userChanged = false
  let userMutationSeq = 0
  let pendingApplySeq = 0

  const markUserChanged = () => {
    userChanged = true
    userMutationSeq += 1
  }

  const resetForNewImage = () => {
    appliedKey = null
    userChanged = false
    pendingApplySeq += 1 // cancel any queued microtask apply
    userMutationSeq += 1 // invalidate user-seq snapshots
  }

  const scheduleApply = (key: string, apply: () => void) => {
    // Capture both sequence snapshots BEFORE mutating `appliedKey`.
    // If a concurrent `markUserChanged()` fires between this and the
    // microtask, the captured `userSeqAtSchedule` will mismatch and
    // the apply is correctly skipped.
    const userSeqAtSchedule = userMutationSeq
    const scheduleSeq = ++pendingApplySeq
    appliedKey = key
    queueMicrotask(() => {
      if (scheduleSeq !== pendingApplySeq) return
      if (userMutationSeq !== userSeqAtSchedule) return
      apply()
    })
  }

  return {
    getAppliedKey: () => appliedKey,
    hasUserChanged: () => userChanged,
    markUserChanged,
    resetForNewImage,
    scheduleApply,
  }
}

