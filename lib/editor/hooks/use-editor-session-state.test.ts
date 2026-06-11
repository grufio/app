import { describe, expect, it } from "vitest"

import { editorSessionReducer, type SessionState } from "@/lib/editor/hooks/use-editor-session-state"

function makeState(overrides?: Partial<SessionState>): SessionState {
  return {
    restoreOpen: false,
    deleteOpen: false,
    toolbarTheme: "dark",
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

describe("editorSessionReducer — toolbarTheme", () => {
  it("defaults to dark (black) and toggles dark↔light", () => {
    const state = makeState()
    expect(state.toolbarTheme).toBe("dark")
    const light = editorSessionReducer(state, { type: "toggleToolbarTheme" })
    expect(light.toolbarTheme).toBe("light")
    const backToDark = editorSessionReducer(light, { type: "toggleToolbarTheme" })
    expect(backToDark.toolbarTheme).toBe("dark")
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
