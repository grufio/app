import { describe, expect, it } from "vitest"

import { editorSessionReducer, type SessionState } from "@/lib/editor/use-editor-session-state"

function makeState(overrides?: Partial<SessionState>): SessionState {
  return {
    restoreOpen: false,
    deleteOpen: false,
    leftPanelTab: "image",
    canvasMode: "image",
    hiddenFilterIds: {},
    ...overrides,
  }
}

describe("editorSessionReducer", () => {
  it("switches canvas mode deterministically", () => {
    const out = editorSessionReducer(makeState(), { type: "setCanvasMode", mode: "filter" })
    expect(out.canvasMode).toBe("filter")
  })

  it("toggles filter visibility and supports explicit show", () => {
    const hidden = editorSessionReducer(makeState(), { type: "toggleHiddenFilter", filterId: "f1" })
    expect(hidden.hiddenFilterIds.f1).toBe(true)
    const shown = editorSessionReducer(hidden, { type: "showFilter", filterId: "f1" })
    expect(shown.hiddenFilterIds.f1).toBeUndefined()
  })

  it("prunes hidden ids against current stack", () => {
    const state = makeState({ hiddenFilterIds: { keep: true, drop: true } })
    const out = editorSessionReducer(state, { type: "pruneHiddenFilters", validIds: new Set(["keep"]) })
    expect(out.hiddenFilterIds).toEqual({ keep: true })
  })
})
