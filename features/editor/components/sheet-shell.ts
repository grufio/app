/**
 * Shared root-className for the editor section sheets (Artboard /
 * Filter / Trace / Colors).
 *
 * Mobile (default): fullscreen overlay inside the editor layout
 * container (`absolute inset-0`), bounded by the layout's `relative`
 * parent. `md:hidden` keeps it mobile-only for any legacy caller.
 *
 * Desktop (`desktop=true`): the sheet stays mounted on `md+` and
 * collapses to a bounded floating card anchored under the top-right
 * Edit bar (`md:top-16` clears the `top-3` bar so Edit/Eye stay
 * clickable; `md:w-80` keeps it off the canvas). The inner
 * `flex-1 overflow-y-auto` body already scrolls.
 */
export function sheetRootClass(desktop: boolean | undefined): string {
  const base = "absolute inset-0 z-30 flex flex-col overflow-hidden bg-background"
  if (!desktop) return `${base} md:hidden`
  return `${base} md:inset-auto md:top-16 md:right-3 md:bottom-3 md:left-auto md:w-80 md:rounded-lg md:border md:shadow-xl md:ring-1 md:ring-black/5`
}
