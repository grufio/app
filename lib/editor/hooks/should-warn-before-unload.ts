/**
 * Decides whether the browser's `beforeunload` confirmation should
 * fire when the editor user tries to close the tab.
 *
 * Shell-scope signal: a filter/crop/restore mutation is in flight.
 * Losing the client half leaves a stale `filter_working_copy` row
 * plus storage object behind for eventual-consistent cleanup.
 *
 * Dialog-configuring guards moved into their owning scope
 * components (`FilterSurfaceScope`, `TraceSurfaceScope`), each of
 * which calls `useMutationLeaveGuard` directly with its own boolean.
 * Multiple `useMutationLeaveGuard` instances coexist — the browser
 * ORs the `beforeunload` listeners, so the net warning fires when
 * any concern raises it.
 *
 * Pure decision logic so it can be unit-tested without `renderHook`
 * or a fake `window`. The hook (`useMutationLeaveGuard`) is a thin
 * effect-installer around the result.
 */
export type EditorLeaveSignals = {
  mutationInFlight: boolean
}

export function shouldWarnBeforeUnload(signals: EditorLeaveSignals): boolean {
  return signals.mutationInFlight
}
