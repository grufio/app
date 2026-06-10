import { describe, expect, it } from "vitest"

import { editorSessionReducer, type SessionState } from "@/lib/editor/hooks/use-editor-session-state"

function makeState(overrides?: Partial<SessionState>): SessionState {
  return {
    restoreOpen: false,
    deleteOpen: false,
    hiddenFilterIds: {},
    traceOverlayVisible: true,
    previewBitmapVisible: true,
    numbersLayerVisible: true,
    ...overrides,
  }
}

describe("editorSessionReducer — restoreOpen / deleteOpen", () => {
  it("toggles restore dialog state deterministically", () => {
    const out = editorSessionReducer(makeState(), { type: "setRestoreOpen", open: true })
    expect(out.restoreOpen).toBe(true)
  })

  it("returns the same state object when restoreOpen is unchanged", () => {
    const state = makeState()
    expect(editorSessionReducer(state, { type: "setRestoreOpen", open: false })).toBe(state)
  })

  it("toggles deleteOpen and respects identity on no-op", () => {
    const state = makeState()
    expect(editorSessionReducer(state, { type: "setDeleteOpen", open: true }).deleteOpen).toBe(true)
    expect(editorSessionReducer(state, { type: "setDeleteOpen", open: false })).toBe(state)
  })
})

describe("editorSessionReducer — hiddenFilterIds", () => {
  it("toggles filter visibility and supports explicit show", () => {
    const hidden = editorSessionReducer(makeState(), { type: "toggleHiddenFilter", filterId: "f1" })
    expect(hidden.hiddenFilterIds.f1).toBe(true)
    const shown = editorSessionReducer(hidden, { type: "showFilter", filterId: "f1" })
    expect(shown.hiddenFilterIds.f1).toBeUndefined()
  })

  it("hideFilter adds an id; idempotent on second call", () => {
    const first = editorSessionReducer(makeState(), { type: "hideFilter", filterId: "f1" })
    expect(first.hiddenFilterIds.f1).toBe(true)
    expect(editorSessionReducer(first, { type: "hideFilter", filterId: "f1" })).toBe(first)
  })

  it("showFilter is a no-op when the id is already shown", () => {
    const state = makeState()
    expect(editorSessionReducer(state, { type: "showFilter", filterId: "f1" })).toBe(state)
  })

  it("toggleHiddenFilter flips presence both ways", () => {
    const after1 = editorSessionReducer(makeState(), { type: "toggleHiddenFilter", filterId: "f1" })
    expect(after1.hiddenFilterIds).toEqual({ f1: true })
    const after2 = editorSessionReducer(after1, { type: "toggleHiddenFilter", filterId: "f1" })
    expect(after2.hiddenFilterIds).toEqual({})
  })
})

describe("editorSessionReducer — trace tab visibility flags", () => {
  it("toggles traceOverlayVisible and is identity-stable on no-op", () => {
    const state = makeState()
    expect(state.traceOverlayVisible).toBe(true)
    const off = editorSessionReducer(state, { type: "setTraceOverlayVisible", visible: false })
    expect(off.traceOverlayVisible).toBe(false)
    // back to the same value → same object reference, like setLeftPanelTab
    expect(editorSessionReducer(off, { type: "setTraceOverlayVisible", visible: false })).toBe(off)
  })

  it("toggles previewBitmapVisible independently of the overlay flag", () => {
    const state = makeState({ traceOverlayVisible: false })
    const out = editorSessionReducer(state, { type: "setPreviewBitmapVisible", visible: false })
    expect(out.previewBitmapVisible).toBe(false)
    expect(out.traceOverlayVisible).toBe(false) // unrelated flag untouched
  })

  it("toggles numbersLayerVisible independently and is identity-stable on no-op", () => {
    const state = makeState()
    expect(state.numbersLayerVisible).toBe(true)
    const off = editorSessionReducer(state, { type: "setNumbersLayerVisible", visible: false })
    expect(off.numbersLayerVisible).toBe(false)
    expect(off.traceOverlayVisible).toBe(true) // unrelated
    expect(off.previewBitmapVisible).toBe(true) // unrelated
    expect(editorSessionReducer(off, { type: "setNumbersLayerVisible", visible: false })).toBe(off)
  })
})

describe("editorSessionReducer — pruneHiddenFilters", () => {
  it("prunes hidden ids against current stack", () => {
    const state = makeState({ hiddenFilterIds: { keep: true, drop: true } })
    const out = editorSessionReducer(state, { type: "pruneHiddenFilters", validIds: new Set(["keep"]) })
    expect(out.hiddenFilterIds).toEqual({ keep: true })
  })

  it("returns the same state object when nothing changes", () => {
    const state = makeState({ hiddenFilterIds: { f1: true } })
    expect(
      editorSessionReducer(state, { type: "pruneHiddenFilters", validIds: new Set(["f1"]) }),
    ).toBe(state)
  })

  it("returns the same state object when hiddenFilterIds is already empty", () => {
    const state = makeState()
    expect(
      editorSessionReducer(state, { type: "pruneHiddenFilters", validIds: new Set(["anything"]) }),
    ).toBe(state)
  })

  it("removes all hidden ids when the valid set is empty", () => {
    const state = makeState({ hiddenFilterIds: { a: true, b: true } })
    expect(
      editorSessionReducer(state, { type: "pruneHiddenFilters", validIds: new Set() }).hiddenFilterIds,
    ).toEqual({})
  })
})
