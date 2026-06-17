/**
 * Shared root-className for the editor section sheets (Artboard /
 * Filter / Trace / Colors).
 *
 * Unified across viewports: a fullscreen overlay inside the editor layout
 * container (`absolute inset-0`), bounded by the layout's `relative`
 * parent, on every breakpoint. Desktop now matches mobile — there is no
 * bounded right-side card variant. The inner `flex-1 overflow-y-auto`
 * body already scrolls.
 */
export function sheetRootClass(): string {
  return "absolute inset-0 z-30 flex flex-col overflow-hidden bg-background"
}
