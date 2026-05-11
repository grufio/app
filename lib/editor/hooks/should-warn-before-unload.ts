/**
 * Decides whether the browser's `beforeunload` confirmation should
 * fire when the editor user tries to close the tab.
 *
 * Two classes of signal are load-bearing:
 *
 *  1. **Mutation in flight** — a filter/crop/restore call is mid-air.
 *     Losing the client half leaves a stale `filter_working_copy` row
 *     plus storage object behind for eventual-consistent cleanup.
 *
 *  2. **Dialog being configured** — the user has progressed past the
 *     selection step into the form. Numerate-Wizard step 2/3, the
 *     Filter form with parameters typed in, etc. The form state lives
 *     in the dialog component and would be lost on close.
 *
 * Pure decision logic so it can be unit-tested without `renderHook`
 * or a fake `window`. The hook (`useMutationLeaveGuard`) is a thin
 * effect-installer around the result.
 */
export type EditorLeaveSignals = {
  mutationInFlight: boolean
  filterDialogConfiguring: boolean
  traceDialogConfiguring: boolean
}

export function shouldWarnBeforeUnload(signals: EditorLeaveSignals): boolean {
  return (
    signals.mutationInFlight ||
    signals.filterDialogConfiguring ||
    signals.traceDialogConfiguring
  )
}
