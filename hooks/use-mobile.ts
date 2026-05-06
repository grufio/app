/**
 * Responsive breakpoint hook.
 *
 * Responsibilities:
 * - Expose a boolean for “is mobile” based on a fixed breakpoint.
 *
 * Implementation: useSyncExternalStore over a matchMedia subscription.
 * This is the React-blessed pattern for external reactive sources — no
 * setState-in-effect, no SSR mismatch (server snapshot returns false).
 */
import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(notify: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const mql = window.matchMedia(MEDIA_QUERY)
  mql.addEventListener("change", notify)
  return () => mql.removeEventListener("change", notify)
}

function getSnapshot(): boolean {
  return window.matchMedia(MEDIA_QUERY).matches
}

function getServerSnapshot(): boolean {
  // SSR has no viewport; default to desktop. The first client render
  // re-syncs with the real value, no setState in an effect.
  return false
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
