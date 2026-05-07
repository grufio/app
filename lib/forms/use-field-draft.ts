"use client"

/**
 * React hook around the draft+commit lifecycle reducer.
 *
 * Thin shim: the lifecycle logic lives in `field-draft-reducer` (pure,
 * unit-tested). This hook wires the reducer to React state and the
 * caller's onCommit / onDraftChange callbacks.
 *
 * Implementation notes:
 *   - State lives in `useReducer` (not a ref) so the React Compiler /
 *     react-hooks linter is happy with render-time access.
 *   - Effects from the reducer are tagged and fired exactly once per
 *     dispatch via a tag-comparison useEffect. The tag prevents
 *     StrictMode dev-mode double-fires.
 *   - Callbacks are held in refs that are updated inside an effect
 *     (not during render) so a parent re-render with a new
 *     `onCommit` identity doesn't reset the field's state.
 */
import * as React from "react"

import {
  initialFieldDraftState,
  reduceFieldDraft,
  type FieldDraftEffect,
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

type AugmentedState = {
  core: FieldDraftState
  pendingEffects: FieldDraftEffect[]
  /** Increments per dispatch so the effects-firing useEffect runs exactly once. */
  tag: number
}

function augmentedReducer(s: AugmentedState, event: FieldDraftEvent): AugmentedState {
  const { state: nextCore, effects } = reduceFieldDraft(s.core, event)
  return {
    core: nextCore,
    pendingEffects: effects,
    tag: s.tag + 1,
  }
}

function init(value: string): AugmentedState {
  return { core: initialFieldDraftState(value), pendingEffects: [], tag: 0 }
}

export function useFieldDraft(args: UseFieldDraftArgs): UseFieldDraftResult {
  const { value, onCommit, onDraftChange } = args
  const [s, dispatch] = React.useReducer(augmentedReducer, value, init)

  // Latest-callback refs — updated inside an effect so we don't mutate
  // refs during render (React Compiler / react-hooks/refs rule).
  const onCommitRef = React.useRef(onCommit)
  const onDraftChangeRef = React.useRef(onDraftChange)
  React.useEffect(() => {
    onCommitRef.current = onCommit
    onDraftChangeRef.current = onDraftChange
  })

  // Fire pending effects exactly once per dispatch (the tag dep ensures
  // StrictMode's double-effect-mount doesn't double-fire).
  const lastFiredTagRef = React.useRef(0)
  React.useEffect(() => {
    if (s.tag === 0) return
    if (s.tag === lastFiredTagRef.current) return
    lastFiredTagRef.current = s.tag
    for (const eff of s.pendingEffects) {
      if (eff.type === "commit") onCommitRef.current(eff.value)
      else if (eff.type === "draftChange") onDraftChangeRef.current?.(eff.value)
    }
  }, [s.tag, s.pendingEffects])

  // Sync upstream `value` changes. The reducer guards against clobbering
  // the user's draft when focused, so we can dispatch unconditionally.
  // Skip if the upstream already matches state to keep effect dep churn down.
  React.useEffect(() => {
    if (value !== s.core.value) {
      dispatch({ type: "syncFromUpstream", next: value })
    }
  }, [value, s.core.value])

  const setDraft = React.useCallback(
    (next: string) => dispatch({ type: "setDraft", next }),
    []
  )
  const commit = React.useCallback(() => dispatch({ type: "enter" }), [])
  const revert = React.useCallback(() => dispatch({ type: "escape" }), [])
  const cancelPendingCommit = React.useCallback(
    () => dispatch({ type: "cancelPendingCommit" }),
    []
  )

  const onFocus = React.useCallback(() => dispatch({ type: "focus" }), [])
  const onBlur = React.useCallback(() => dispatch({ type: "blur" }), [])
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
    []
  )

  return {
    draft: s.core.draft,
    isFocused: s.core.isFocused,
    setDraft,
    commit,
    revert,
    cancelPendingCommit,
    inputProps: {
      value: s.core.draft,
      onFocus,
      onBlur,
      onKeyDown,
    },
  }
}
