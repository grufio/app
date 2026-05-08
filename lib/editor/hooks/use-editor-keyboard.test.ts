import { describe, expect, it } from "vitest"

import { decideEditorKeyboardAction } from "./use-editor-keyboard"

const baseInput = {
  key: "Delete",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isEditableTarget: false,
  isDialogOpen: false,
  canDelete: true,
} as const

describe("decideEditorKeyboardAction — delete", () => {
  it("Delete triggers delete when conditions are met", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, key: "Delete" })).toEqual({ kind: "delete" })
  })

  it("Backspace triggers delete when conditions are met", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, key: "Backspace" })).toEqual({ kind: "delete" })
  })

  it("does not trigger when canDelete is false", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, canDelete: false })).toBeNull()
  })

  it("does not trigger inside an editable target (input/textarea/contenteditable)", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, isEditableTarget: true })).toBeNull()
  })

  it("does not trigger while a dialog is already open", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, isDialogOpen: true })).toBeNull()
  })

  it("does not trigger when a Cmd/Ctrl modifier is held", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, metaKey: true })).toBeNull()
    expect(decideEditorKeyboardAction({ ...baseInput, ctrlKey: true })).toBeNull()
  })

  it("does not trigger when Alt is held", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, altKey: true })).toBeNull()
  })

  it("does not trigger for unrelated keys", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, key: "Enter" })).toBeNull()
    expect(decideEditorKeyboardAction({ ...baseInput, key: "Escape" })).toBeNull()
    expect(decideEditorKeyboardAction({ ...baseInput, key: "a" })).toBeNull()
  })

  it("Shift+Delete still triggers (Shift is not an exclusive modifier)", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, shiftKey: true })).toEqual({ kind: "delete" })
  })
})

describe("decideEditorKeyboardAction — arrow nudge", () => {
  const arrowBase = { ...baseInput, key: "ArrowLeft" } as const

  it("ArrowLeft nudges -1 px on x", () => {
    expect(decideEditorKeyboardAction(arrowBase)).toEqual({ kind: "nudge", dxPx: -1, dyPx: 0 })
  })

  it("ArrowRight nudges +1 px on x", () => {
    expect(decideEditorKeyboardAction({ ...arrowBase, key: "ArrowRight" })).toEqual({
      kind: "nudge",
      dxPx: 1,
      dyPx: 0,
    })
  })

  it("ArrowUp nudges -1 px on y", () => {
    expect(decideEditorKeyboardAction({ ...arrowBase, key: "ArrowUp" })).toEqual({
      kind: "nudge",
      dxPx: 0,
      dyPx: -1,
    })
  })

  it("ArrowDown nudges +1 px on y", () => {
    expect(decideEditorKeyboardAction({ ...arrowBase, key: "ArrowDown" })).toEqual({
      kind: "nudge",
      dxPx: 0,
      dyPx: 1,
    })
  })

  it("Shift+Arrow scales nudge to 10 px", () => {
    expect(decideEditorKeyboardAction({ ...arrowBase, shiftKey: true })).toEqual({
      kind: "nudge",
      dxPx: -10,
      dyPx: 0,
    })
  })

  it("Cmd+Arrow scales nudge to 50 px (mac)", () => {
    expect(decideEditorKeyboardAction({ ...arrowBase, metaKey: true })).toEqual({
      kind: "nudge",
      dxPx: -50,
      dyPx: 0,
    })
  })

  it("Ctrl+Arrow scales nudge to 50 px (windows)", () => {
    expect(decideEditorKeyboardAction({ ...arrowBase, ctrlKey: true })).toEqual({
      kind: "nudge",
      dxPx: -50,
      dyPx: 0,
    })
  })

  it("does NOT nudge inside an editable target (caret movement wins)", () => {
    expect(decideEditorKeyboardAction({ ...arrowBase, isEditableTarget: true })).toBeNull()
  })

  it("does NOT nudge while a dialog is open", () => {
    expect(decideEditorKeyboardAction({ ...arrowBase, isDialogOpen: true })).toBeNull()
  })

  it("Alt+Arrow is not nudged (alt reserved for OS)", () => {
    expect(decideEditorKeyboardAction({ ...arrowBase, altKey: true })).toBeNull()
  })
})
