/**
 * Phase 0 of the form-fields unification (see plan
 * /Users/christian/.claude/plans/form-fields-unification.md).
 *
 * These tests define the *contract* of the pure draft-state reducer
 * that powers <FormField>. They are written before the implementation
 * exists — running this file should fail at module-resolution today.
 *
 * The reducer is deliberately split out from the React hook so the
 * core lifecycle can be tested without DOM / React-renderer infra
 * (we don't have @testing-library/react in this codebase). Once the
 * reducer is correct, the hook is a ~10-line useReducer wrapper.
 */
import { describe, expect, it } from "vitest"

import {
  reduceFieldDraft,
  initialFieldDraftState,
  type FieldDraftEffect,
  type FieldDraftEvent,
  type FieldDraftState,
} from "./field-draft-reducer"

function step(state: FieldDraftState, event: FieldDraftEvent) {
  return reduceFieldDraft(state, event)
}

function run(initial: FieldDraftState, events: FieldDraftEvent[]) {
  const allEffects: FieldDraftEffect[] = []
  let state = initial
  for (const ev of events) {
    const r = step(state, ev)
    state = r.state
    allEffects.push(...r.effects)
  }
  return { state, effects: allEffects }
}

describe("initialFieldDraftState", () => {
  it("seeds draft from upstream value", () => {
    const s = initialFieldDraftState("hello")
    expect(s.draft).toBe("hello")
    expect(s.value).toBe("hello")
    expect(s.isFocused).toBe(false)
    expect(s.cancelPending).toBe(false)
  })
})

describe("setDraft", () => {
  it("updates draft and emits draftChange effect", () => {
    const s = initialFieldDraftState("a")
    const { state, effects } = step(s, { type: "setDraft", next: "ab" })
    expect(state.draft).toBe("ab")
    expect(state.value).toBe("a") // upstream untouched
    expect(effects).toEqual([{ type: "draftChange", value: "ab" }])
  })

  it("does not emit commit on every keystroke", () => {
    const s = initialFieldDraftState("a")
    const r = run(s, [
      { type: "setDraft", next: "ab" },
      { type: "setDraft", next: "abc" },
    ])
    expect(r.effects.every((e) => e.type !== "commit")).toBe(true)
  })
})

describe("syncFromUpstream", () => {
  it("updates draft when not focused", () => {
    const s = initialFieldDraftState("old")
    const { state, effects } = step(s, { type: "syncFromUpstream", next: "new" })
    expect(state.value).toBe("new")
    expect(state.draft).toBe("new")
    // Sync is silent — no draftChange (it's not a user edit).
    expect(effects).toEqual([])
  })

  it("preserves draft when focused (user input wins)", () => {
    const s = initialFieldDraftState("old")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "user-typing" },
      { type: "syncFromUpstream", next: "remote-update" },
    ])
    expect(r.state.value).toBe("remote-update") // upstream is tracked
    expect(r.state.draft).toBe("user-typing") // but draft is preserved
  })

  it("is a no-op when next equals current value", () => {
    const s = { ...initialFieldDraftState("same"), draft: "different-edit" }
    const { state, effects } = step(s, { type: "syncFromUpstream", next: "same" })
    expect(state.draft).toBe("different-edit")
    expect(effects).toEqual([])
  })
})

describe("commit on Enter / blur", () => {
  it("Enter emits commit with current draft when draft differs from value", () => {
    const s = initialFieldDraftState("a")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "ab" },
      { type: "enter" },
    ])
    const commits = r.effects.filter((e) => e.type === "commit")
    expect(commits).toEqual([{ type: "commit", value: "ab" }])
  })

  it("blur emits commit with current draft when draft differs from value", () => {
    const s = initialFieldDraftState("a")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "ab" },
      { type: "blur" },
    ])
    const commits = r.effects.filter((e) => e.type === "commit")
    expect(commits).toEqual([{ type: "commit", value: "ab" }])
  })

  it("blur is a no-op when draft equals value (no commit-spam)", () => {
    const s = initialFieldDraftState("a")
    const r = run(s, [{ type: "focus" }, { type: "blur" }])
    const commits = r.effects.filter((e) => e.type === "commit")
    expect(commits).toEqual([])
  })

  it("Enter is a no-op when draft equals value", () => {
    const s = initialFieldDraftState("a")
    const { effects } = step(s, { type: "enter" })
    expect(effects.filter((e) => e.type === "commit")).toEqual([])
  })

  it("blur clears the focus flag", () => {
    const s = initialFieldDraftState("a")
    const r = run(s, [{ type: "focus" }, { type: "blur" }])
    expect(r.state.isFocused).toBe(false)
  })
})

describe("Escape revert", () => {
  it("resets draft to value without emitting commit", () => {
    const s = initialFieldDraftState("a")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "ab" },
      { type: "escape" },
    ])
    expect(r.state.draft).toBe("a")
    expect(r.effects.filter((e) => e.type === "commit")).toEqual([])
  })

  it("emits a draftChange so controlled callers can sync", () => {
    const s = initialFieldDraftState("a")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "ab" },
      { type: "escape" },
    ])
    const lastDraftChange = r.effects.filter((e) => e.type === "draftChange").at(-1)
    expect(lastDraftChange).toEqual({ type: "draftChange", value: "a" })
  })
})

describe("cancelPendingCommit", () => {
  it("suppresses the next blur-commit", () => {
    const s = initialFieldDraftState("a")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "ab" },
      { type: "cancelPendingCommit" },
      { type: "blur" },
    ])
    expect(r.effects.filter((e) => e.type === "commit")).toEqual([])
    // After being consumed, the flag clears so the *next* blur commits normally.
    expect(r.state.cancelPending).toBe(false)
  })

  it("does not suppress Enter (Enter is an explicit user action)", () => {
    const s = initialFieldDraftState("a")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "ab" },
      { type: "cancelPendingCommit" },
      { type: "enter" },
    ])
    expect(r.effects.filter((e) => e.type === "commit")).toEqual([
      { type: "commit", value: "ab" },
    ])
  })

  it("only cancels one blur — subsequent blurs commit normally", () => {
    // Re-edit after a cancelled blur should commit on next blur.
    let state = initialFieldDraftState("a")
    state = step(state, { type: "focus" }).state
    state = step(state, { type: "setDraft", next: "ab" }).state
    state = step(state, { type: "cancelPendingCommit" }).state
    state = step(state, { type: "blur" }).state
    // Re-focus and edit again.
    state = step(state, { type: "focus" }).state
    state = step(state, { type: "setDraft", next: "abc" }).state
    const r = step(state, { type: "blur" })
    expect(r.effects.filter((e) => e.type === "commit")).toEqual([
      { type: "commit", value: "abc" },
    ])
  })
})

describe("focus tracking", () => {
  it("focus marks isFocused = true", () => {
    const s = initialFieldDraftState("a")
    const { state } = step(s, { type: "focus" })
    expect(state.isFocused).toBe(true)
  })

  it("syncFromUpstream during focus does not clobber draft, but updates value", () => {
    // Simulates the case where save() updates the upstream while the user is
    // still typing. Old patterns lost the user's input here.
    const s = initialFieldDraftState("100")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "150" },
      { type: "syncFromUpstream", next: "100" }, // server echoed back
    ])
    expect(r.state.draft).toBe("150")
    expect(r.state.value).toBe("100")
  })
})

describe("integrated scenario: aspect-lock pattern", () => {
  it("setDraft fires draftChange so callers can drive the locked partner field", () => {
    // image-size-inputs aspect-lock relies on getting EVERY keystroke so
    // it can compute the locked dimension and update the partner field.
    const s = initialFieldDraftState("100")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "150" },
      { type: "setDraft", next: "200" },
    ])
    expect(r.effects.filter((e) => e.type === "draftChange")).toEqual([
      { type: "draftChange", value: "150" },
      { type: "draftChange", value: "200" },
    ])
  })

  it("only the final commit fires onCommit, not the intermediate keystrokes", () => {
    const s = initialFieldDraftState("100")
    const r = run(s, [
      { type: "focus" },
      { type: "setDraft", next: "150" },
      { type: "setDraft", next: "200" },
      { type: "blur" },
    ])
    expect(r.effects.filter((e) => e.type === "commit")).toEqual([
      { type: "commit", value: "200" },
    ])
  })
})
