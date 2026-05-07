"use client"

/**
 * Restore focus to the trigger element when a state-driven Radix Dialog
 * closes.
 *
 * Why a hook: Radix Dialog restores focus natively when opened via
 * `<DialogTrigger asChild>` — the trigger element is in the React tree
 * and Radix tracks it. But we open most editor dialogs *programmatically*
 * via `setOpen(true)` from icon-button click handlers; Radix never sees
 * the trigger and on close hands focus back to the document body. That
 * breaks keyboard nav and assistive tech expectations.
 *
 * Usage:
 *   const focusReturn = useDialogFocusReturn()
 *
 *   <button onClick={() => { focusReturn.captureOnOpen(); setOpen(true) }}>
 *     …
 *   </button>
 *
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogContent onCloseAutoFocus={focusReturn.onCloseAutoFocus}>
 *
 * The capture runs *synchronously* in the click handler, before React
 * re-renders and Radix's FocusScope mounts — so `document.activeElement`
 * is still the trigger button, not the dialog content.
 */
import { useCallback, useRef } from "react"

/**
 * Pure focus-restore logic, exposed for unit testing without React.
 *
 * `contains` is the document-contains check inverted-out for testability;
 * pass `(el) => document.contains(el)` in production, a stub in tests.
 */
export function executeFocusReturn(args: {
  trigger: HTMLElement | null
  contains: (el: Node) => boolean
  preventDefault: () => void
}): "focused" | "noop_missing" | "noop_detached" {
  const { trigger, contains, preventDefault } = args
  if (!trigger) return "noop_missing"
  if (!contains(trigger)) return "noop_detached"
  preventDefault()
  trigger.focus()
  return "focused"
}

export function useDialogFocusReturn(): {
  captureOnOpen: () => void
  onCloseAutoFocus: (event: Event) => void
} {
  const triggerRef = useRef<HTMLElement | null>(null)

  const captureOnOpen = useCallback(() => {
    const active = typeof document === "undefined" ? null : document.activeElement
    triggerRef.current = active instanceof HTMLElement ? active : null
  }, [])

  const onCloseAutoFocus = useCallback((event: Event) => {
    if (typeof document === "undefined") return
    executeFocusReturn({
      trigger: triggerRef.current,
      contains: (el) => document.contains(el),
      preventDefault: () => event.preventDefault(),
    })
  }, [])

  return { captureOnOpen, onCloseAutoFocus }
}
