"use client"

/**
 * React hook around the draft+commit lifecycle reducer.
 *
 * Thin shim: the lifecycle logic lives in `field-draft-reducer` (pure,
 * unit-tested). This hook wires the reducer to React state and the
 * caller's onCommit / onDraftChange callbacks.
 *
 * Implementation notes:
 *   - Effects fire synchronously inside `dispatch`, not via a queued
 *     `useEffect`. The earlier tag-based effect queue lost commits when
 *     a sibling button click (e.g. a dialog footer's Preview/Cancel)
 *     both blurred this input AND unmounted the form in the same React
 *     batch — the unmount happened before the queued effect could fire.
 *     Firing synchronously mirrors the color variant's pattern and
 *     matches what users expect: tap-away-to-commit is reliable
 *     regardless of what else the sibling click does.
 *   - State lives in `useReducer` (not a ref) so the React Compiler /
 *     react-hooks linter is happy with render-time access. The reducer
 *     for React's purposes returns only the next state; the pure
 *     `reduceFieldDraft` (which also returns effects) is invoked from
 *     `dispatch` against a ref-mirrored copy of state so effects can
 *     fire alongside the dispatch.
 *   - Callbacks are held in refs that are updated inside an effect
 *     (not during render) so a parent re-render with a new
 *     `onCommit` identity doesn't reset the field's state.
 */
import * as React from "react"

import {
  initialFieldDraftState,
  reduceFieldDraft,
  type FieldDraftEvent,
  type FieldDraftState,
} from "./field-draft-reducer"

export type UseFieldDraftArgs = {
  value: string
  onCommit: (next: string) => void
  onDraftChange?: (next: string) => void
}

export type UseFieldDraftResult = {
  draft: string
  isFocused: boolean
  setDraft: (next: string) => void
  commit: () => void
  revert: () => void
  cancelPendingCommit: () => void
  inputProps: {
    value: string
    onFocus: (e?: React.FocusEvent<HTMLInputElement>) => void
    onBlur: (e?: React.FocusEvent<HTMLInputElement>) => void
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  }
}

function reactReducer(s: FieldDraftState, event: FieldDraftEvent): FieldDraftState {
  return reduceFieldDraft(s, event).state
}

export function useFieldDraft(args: UseFieldDraftArgs): UseFieldDraftResult {
  const { value, onCommit, onDraftChange } = args
  const [state, dispatchRaw] = React.useReducer(reactReducer, value, initialFieldDraftState)

  // Latest-callback refs — updated inside an effect so we don't mutate
  // refs during render (React Compiler / react-hooks/refs rule).
  const onCommitRef = React.useRef(onCommit)
  const onDraftChangeRef = React.useRef(onDraftChange)
  React.useEffect(() => {
    onCommitRef.current = onCommit
    onDraftChangeRef.current = onDraftChange
  })

  // Sync ref tracks the LATEST committed-by-our-dispatch state so that
  // multiple dispatches within the same React batch (e.g. an
  // `onChange` immediately followed by another `setDraft`) compute
  // their effects against the post-prior-dispatch state. The
  // useLayoutEffect keeps it in sync with any state changes that
  // happened via React's own pathway (StrictMode rerenders, prop syncs).
  const stateRef = React.useRef(state)
  React.useLayoutEffect(() => {
    stateRef.current = state
  })

  const dispatch = React.useCallback((event: FieldDraftEvent) => {
    const step = reduceFieldDraft(stateRef.current, event)
    stateRef.current = step.state
    dispatchRaw(event)
    // Effects fire here, in the event handler that triggered the
    // dispatch — not in a useEffect after render. A sibling button
    // click that blurs this input and immediately unmounts the form
    // therefore still delivers the commit to the parent.
    for (const eff of step.effects) {
      if (eff.type === "commit") onCommitRef.current(eff.value)
      else if (eff.type === "draftChange") onDraftChangeRef.current?.(eff.value)
    }
  }, [])

  // Sync upstream `value` changes. The reducer guards against clobbering
  // the user's draft when focused, so we can dispatch unconditionally.
  // Skip if the upstream already matches state to keep effect dep churn down.
  React.useEffect(() => {
    if (value !== state.value) {
      dispatch({ type: "syncFromUpstream", next: value })
    }
  }, [value, state.value, dispatch])

  const setDraft = React.useCallback(
    (next: string) => dispatch({ type: "setDraft", next }),
    [dispatch],
  )
  const commit = React.useCallback(() => dispatch({ type: "enter" }), [dispatch])
  const revert = React.useCallback(() => dispatch({ type: "escape" }), [dispatch])
  const cancelPendingCommit = React.useCallback(
    () => dispatch({ type: "cancelPendingCommit" }),
    [dispatch],
  )

  const onFocus = React.useCallback(() => dispatch({ type: "focus" }), [dispatch])
  const onBlur = React.useCallback(() => dispatch({ type: "blur" }), [dispatch])
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        dispatch({ type: "enter" })
      } else if (e.key === "Escape") {
        e.preventDefault()
        dispatch({ type: "escape" })
      }
    },
    [dispatch],
  )

  return {
    draft: state.draft,
    isFocused: state.isFocused,
    setDraft,
    commit,
    revert,
    cancelPendingCommit,
    inputProps: {
      value: state.draft,
      onFocus,
      onBlur,
      onKeyDown,
    },
  }
}
