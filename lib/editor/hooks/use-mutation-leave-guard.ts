"use client"

/**
 * Browser-leave guard for in-flight editor mutations.
 *
 * The editor's filter-apply / crop / restore flows do server-side work
 * (Python service call, Supabase upload, RPC) plus several client-side
 * state writes. If the user closes the tab or navigates away mid-flight
 * the server side may finish, the client never reconciles, and a stale
 * `filter_working_copy` row + storage object are left behind for the
 * eventual-consistent cleanup to mop up.
 *
 * `beforeunload` is the only browser hook that can warn before page
 * close / tab close / external nav. Returning a string (legacy) and
 * calling `event.preventDefault()` (modern) both trigger Chrome/
 * Firefox/Safari's native "Leave site?" dialog. We don't get to set the
 * message text — browsers ignore it for security reasons.
 *
 * For client-side route changes (Next.js `<Link>`) `beforeunload` does
 * not fire; that's the right call here because Next-internal nav inside
 * the editor stays inside the editor. We only guard against tab/window
 * close.
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
