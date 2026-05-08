"use client"

/**
 * Editor-shell keyboard shortcuts.
 *
 * Currently:
 *  - Delete / Backspace → request delete of the active master.
 *  - Arrow keys         → nudge active image position
 *      • bare arrow:           ±1 px
 *      • Shift+arrow:          ±10 px
 *      • Cmd/Ctrl+arrow:       ±50 px
 *
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

export type EditorKeyboardAction =
  | { kind: "delete" }
  | { kind: "nudge"; dxPx: number; dyPx: number }
  | null

const NUDGE_BASE = 1
const NUDGE_SHIFT = 10
const NUDGE_META = 50

function nudgeStep(input: EditorKeyboardDecisionInput): number {
  if (input.metaKey || input.ctrlKey) return NUDGE_META
  if (input.shiftKey) return NUDGE_SHIFT
  return NUDGE_BASE
}

export function decideEditorKeyboardAction(input: EditorKeyboardDecisionInput): EditorKeyboardAction {
  // Inside text fields / contenteditable: let the browser handle native
  // text editing (caret movement on arrows, native undo). We must not
  // hijack arrow keys in inputs.
  if (input.isEditableTarget) return null
  // While a confirm dialog is open, don't dispatch editor shortcuts.
  if (input.isDialogOpen) return null

  // Arrow nudges.
  if (input.altKey) {
    // Alt is reserved for OS shortcuts (e.g. word-jumps in some apps);
    // skip to avoid conflicts.
    return null
  }
  const step = nudgeStep(input)
  if (input.key === "ArrowLeft") return { kind: "nudge", dxPx: -step, dyPx: 0 }
  if (input.key === "ArrowRight") return { kind: "nudge", dxPx: step, dyPx: 0 }
  if (input.key === "ArrowUp") return { kind: "nudge", dxPx: 0, dyPx: -step }
  if (input.key === "ArrowDown") return { kind: "nudge", dxPx: 0, dyPx: step }

  // Bare-key actions (no modifier — Delete uses raw key).
  if (input.metaKey || input.ctrlKey) return null

  if ((input.key === "Delete" || input.key === "Backspace") && input.canDelete) {
    return { kind: "delete" }
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
  onNudge?: (dxPx: number, dyPx: number) => void
}): void {
  const { enabled, canDelete, onDelete, onNudge } = opts

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

      if (!action) return

      if (action.kind === "delete") {
        e.preventDefault()
        onDelete()
      } else if (action.kind === "nudge") {
        if (!onNudge) return
        e.preventDefault()
        onNudge(action.dxPx, action.dyPx)
      }
    }

    document.addEventListener("keydown", handler)
    return () => {
      document.removeEventListener("keydown", handler)
    }
  }, [enabled, canDelete, onDelete, onNudge])
}
