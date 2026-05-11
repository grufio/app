"use client"

/**
 * Browser-leave guard for the editor.
 *
 * Originally scoped to in-flight server mutations (filter / crop /
 * restore) because losing the client half of a Python-service call
 * leaves a stale `filter_working_copy` row + storage object behind.
 *
 * Extended to also cover **dialogs in the configuring phase** —
 * Numerate-Wizard step 2/3, Filter form with parameters typed, etc.
 * The form draft state lives inside the dialog component and would
 * be silently lost on tab close. Callers compose the boolean via
 * `shouldWarnBeforeUnload` (sibling file).
 *
 * `beforeunload` is the only browser hook that can warn before page
 * close / tab close / external nav. Returning a string (legacy) and
 * calling `event.preventDefault()` (modern) both trigger Chrome/
 * Firefox/Safari's native "Leave site?" dialog. We don't get to set
 * the message text — browsers ignore it for security reasons.
 *
 * For client-side route changes (Next.js `<Link>`) `beforeunload` does
 * not fire; that's the right call here because Next-internal nav
 * inside the editor stays inside the editor. We only guard against
 * tab/window close.
 */
import { useEffect } from "react"

export function useMutationLeaveGuard(opts: { active: boolean }): void {
  const { active } = opts
  useEffect(() => {
    if (!active) return
    function handler(e: BeforeUnloadEvent) {
      // Both branches needed for cross-browser support: modern
      // browsers honor preventDefault, legacy ones look at returnValue.
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => {
      window.removeEventListener("beforeunload", handler)
    }
  }, [active])
}
