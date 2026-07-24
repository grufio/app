"use client"

/**
 * Single source of truth for the editor's md breakpoint (≥768px) at runtime.
 *
 * The trace/section dialogs present their actions differently per viewport
 * (icon buttons in the header on mobile, text buttons in a footer on desktop).
 * Rendering BOTH and toggling with CSS `md:` mounts two copies of every action
 * — fragile, and a source of duplicate/ghosted buttons. This hook lets a caller
 * render the actions ONCE, choosing the placement, so only one copy is ever in
 * the DOM.
 *
 * Safe to use here because these dialogs open on client interaction (never
 * server-rendered in their open state), so the synchronous initial read is
 * correct on first paint and there is no hydration mismatch.
 */
import { useEffect, useState } from "react"

const DESKTOP_QUERY = "(min-width: 768px)"

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(DESKTOP_QUERY).matches,
  )

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setIsDesktop(mq.matches)
    onChange()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return isDesktop
}
