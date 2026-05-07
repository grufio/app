"use client"

/**
 * Editor-shell keyboard shortcuts.
 *
 * Currently only Delete/Backspace → request delete of the active master.
 * Escape is handled natively by Radix dialogs; Cmd/Ctrl-Z (undo) needs a
 * real transaction log and is intentionally out of scope here — adding
 * a stub that pretends to undo is worse than nothing.
 *
 * The decision function is pure and lives outside the hook so the rule
 * set is unit-testable without DOM/React.
 */
import { useEffect } from "react"

export type EditorKeyboardDecisionInput = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isEditableTarget: boolean
  isDialogOpen: boolean
  canDelete: boolean
}

export type EditorKeyboardAction = "delete" | null

export function decideEditorKeyboardAction(input: EditorKeyboardDecisionInput): EditorKeyboardAction {
  // Modifier combos belong to other shortcuts (Cmd-Z, Cmd-S, browser
  // shortcuts). We only own bare keys.
  if (input.metaKey || input.ctrlKey || input.altKey) return null
  // Don't intercept Backspace/Delete inside text fields — that breaks
  // every input on the page.
  if (input.isEditableTarget) return null
  // While a confirm dialog is open, don't open another one.
  if (input.isDialogOpen) return null

  if ((input.key === "Delete" || input.key === "Backspace") && input.canDelete) {
    return "delete"
  }
  return null
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName.toLowerCase()
  return tag === "input" || tag === "textarea" || tag === "select"
}

function isAnyDialogOpen(): boolean {
  if (typeof document === "undefined") return false
  // Radix sets data-state="open" on the dialog content node while open.
  return document.querySelector('[role="dialog"][data-state="open"]') != null
}

/**
 * Document-level keyboard shortcuts for the editor shell.
 *
 * `enabled` lets the parent disable the listener when the editor isn't
 * the focused surface (e.g. during full-page errors, lock screens).
 */
export function useEditorKeyboard(opts: {
  enabled: boolean
  canDelete: boolean
  onDelete: () => void
}): void {
  const { enabled, canDelete, onDelete } = opts

  useEffect(() => {
    if (!enabled) return

    function handler(e: KeyboardEvent) {
      const action = decideEditorKeyboardAction({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        isEditableTarget: isEditableTarget(e.target),
        isDialogOpen: isAnyDialogOpen(),
        canDelete,
      })

      if (action === "delete") {
        e.preventDefault()
        onDelete()
      }
    }

    document.addEventListener("keydown", handler)
    return () => {
      document.removeEventListener("keydown", handler)
    }
  }, [enabled, canDelete, onDelete])
}
