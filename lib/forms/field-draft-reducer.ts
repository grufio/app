/**
 * Pure state machine for the FormField draft + commit lifecycle.
 *
 * Design rationale: keeping the lifecycle as a pure reducer (rather
 * than a React hook) means we can verify the contract with plain
 * `*.test.ts` files — no DOM, no testing-library. The React hook
 * (`useFieldDraft`) is a thin `useReducer` wrapper around this and
 * is verified via manual smoke testing in the running app.
 *
 * Verbal contract:
 *   - User types → `setDraft` updates draft + emits `draftChange`
 *     (every keystroke). Useful for live-binding partners (aspect-
 *     ratio lock) without committing.
 *   - User presses Enter / blurs the input → `enter` / `blur` emits
 *     `commit` if `draft !== value`. Otherwise no-op.
 *   - User presses Escape → `escape` reverts draft to value, emits
 *     `draftChange` with the reverted value, no commit.
 *   - Upstream changes (server echo, prop update) → `syncFromUpstream`
 *     updates value AND draft if `!isFocused`; if focused, only value
 *     is tracked, draft is preserved (user's input wins).
 *   - `cancelPendingCommit` sets a one-shot flag that suppresses the
 *     next blur-commit. Used by buttons that mutate state on click
 *     (the click implicitly blurs the input but the user did not
 *     intend to commit). Enter still commits — explicit user intent.
 *
 * The reducer is a value: `(state, event) -> { state, effects[] }`.
 * Effects are `commit` / `draftChange`; the host (React hook) walks
 * them and invokes the corresponding callbacks.
 */

export type FieldDraftState = {
  draft: string
  value: string
  isFocused: boolean
  cancelPending: boolean
}

export type FieldDraftEvent =
  | { type: "setDraft"; next: string }
  | { type: "syncFromUpstream"; next: string }
  | { type: "focus" }
  | { type: "blur" }
  | { type: "enter" }
  | { type: "escape" }
  | { type: "cancelPendingCommit" }

export type FieldDraftEffect =
  | { type: "commit"; value: string }
  | { type: "draftChange"; value: string }

export type FieldDraftStep = {
  state: FieldDraftState
  effects: FieldDraftEffect[]
}

export function initialFieldDraftState(value: string): FieldDraftState {
  return { draft: value, value, isFocused: false, cancelPending: false }
}

export function reduceFieldDraft(state: FieldDraftState, event: FieldDraftEvent): FieldDraftStep {
  switch (event.type) {
    case "setDraft": {
      if (event.next === state.draft) {
        return { state, effects: [] }
      }
      return {
        state: { ...state, draft: event.next },
        effects: [{ type: "draftChange", value: event.next }],
      }
    }

    case "syncFromUpstream": {
      // Track value regardless. If focused, keep draft (user's input wins).
      // If not focused, mirror value into draft. No-op when value is unchanged.
      if (event.next === state.value) {
        return { state, effects: [] }
      }
      if (state.isFocused) {
        return { state: { ...state, value: event.next }, effects: [] }
      }
      return { state: { ...state, value: event.next, draft: event.next }, effects: [] }
    }

    case "focus": {
      if (state.isFocused) return { state, effects: [] }
      return { state: { ...state, isFocused: true }, effects: [] }
    }

    case "blur": {
      // Always clear focus. If cancelPending was set, consume it and skip
      // the commit; otherwise commit if draft != value.
      const cleared: FieldDraftState = { ...state, isFocused: false, cancelPending: false }
      if (state.cancelPending) {
        return { state: cleared, effects: [] }
      }
      if (state.draft === state.value) {
        return { state: cleared, effects: [] }
      }
      return { state: cleared, effects: [{ type: "commit", value: state.draft }] }
    }

    case "enter": {
      // Enter is an explicit user action — cancelPending does NOT apply.
      // (cancelPending exists to suppress unintended commits caused by
      // button-click-induced blur, not deliberate Enter presses.)
      if (state.draft === state.value) {
        return { state, effects: [] }
      }
      return { state, effects: [{ type: "commit", value: state.draft }] }
    }

    case "escape": {
      if (state.draft === state.value) {
        return { state, effects: [] }
      }
      return {
        state: { ...state, draft: state.value },
        effects: [{ type: "draftChange", value: state.value }],
      }
    }

    case "cancelPendingCommit": {
      if (state.cancelPending) return { state, effects: [] }
      return { state: { ...state, cancelPending: true }, effects: [] }
    }
  }
}
