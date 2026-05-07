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

describe("decideEditorKeyboardAction", () => {
  it("Delete triggers delete when conditions are met", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, key: "Delete" })).toBe("delete")
  })

  it("Backspace triggers delete when conditions are met", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, key: "Backspace" })).toBe("delete")
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

  it("does not trigger when a modifier is held (Cmd/Ctrl/Alt)", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, metaKey: true })).toBeNull()
    expect(decideEditorKeyboardAction({ ...baseInput, ctrlKey: true })).toBeNull()
    expect(decideEditorKeyboardAction({ ...baseInput, altKey: true })).toBeNull()
  })

  it("does not trigger for unrelated keys", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, key: "Enter" })).toBeNull()
    expect(decideEditorKeyboardAction({ ...baseInput, key: "Escape" })).toBeNull()
    expect(decideEditorKeyboardAction({ ...baseInput, key: "a" })).toBeNull()
  })

  it("Shift+Delete still triggers (Shift is not an exclusive modifier)", () => {
    expect(decideEditorKeyboardAction({ ...baseInput, shiftKey: true })).toBe("delete")
  })
})
