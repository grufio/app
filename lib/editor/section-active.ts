/**
 * Active editor surface — the single named rule for "is the user
 * currently on section X?".
 *
 * Desktop and mobile use separate state today (`leftPanelTab` and
 * `mobileSection` respectively), with `isMobile` selecting which one
 * is authoritative. Multiple consumers compute the same boolean
 * locally — the canvas layer gate in `deriveDisplayLayers`, the
 * dialog-dismiss gate in `useTraceDialogSession` /
 * `useFilterDialogSession`, future read sites — and risk drifting if
 * the rule ever evolves. This module pins it.
 *
 * Pure, no React. The leftPanelTab type is loose `string` because
 * the editor session uses a string union but downstream callers pass
 * raw values; comparing by string equality keeps callers honest
 * without coupling to the session enum.
 */
import type { MobileSection } from "@/lib/editor/display-layers"

export type Surface = "image" | "filter" | "trace"

export function isSurfaceActive(args: {
  surface: Surface
  isMobile: boolean
  leftPanelTab: string
  mobileSection: MobileSection
}): boolean {
  const { surface, isMobile, leftPanelTab, mobileSection } = args
  if (isMobile) {
    // Mobile's "artboard" section maps to desktop's "image" surface.
    if (surface === "image") return mobileSection === "artboard"
    return mobileSection === surface
  }
  return leftPanelTab === surface
}
