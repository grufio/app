/**
 * Persisted-vs-user state sequencing guard (pure).
 *
 * Purpose:
 * - Prevent persisted state (late arriving) from overriding user edits.
 * - Allow “latest scheduled apply wins” semantics for persisted applies.
 *
 * This is intentionally UI-framework-agnostic so it can be unit-tested.
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
    const scheduleSeq = ++pendingApplySeq
    const userSeqAtSchedule = userMutationSeq
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

