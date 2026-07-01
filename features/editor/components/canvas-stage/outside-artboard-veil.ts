/**
 * Outside-artboard veil geometry (pure).
 *
 * The area *outside* the artboard (image spilling over the page edge + empty
 * pasteboard) gets the same white veil as the print padding, so the artboard
 * "pops" and it's clear what lies outside the printable page.
 *
 * Returns the rects covering the visible viewport MINUS the artboard rect
 * `[0,0]…[artW,artH]`, in world coordinates. Corners are covered exactly once
 * (top/bottom span the full visible width; left/right only the middle band) so
 * a semi-transparent fill stays uniform. The artboard edges are clamped into
 * the visible bounds, so any artboard position (partly or fully off-screen) is
 * handled — a fully off-screen artboard veils the whole viewport.
 */
export type VeilRect = { key: string; x: number; y: number; width: number; height: number }

export type VisibleBounds = { left: number; top: number; right: number; bottom: number }

export function computeOutsideArtboardRects(vis: VisibleBounds, artW: number, artH: number): VeilRect[] {
  if (!(artW > 0) || !(artH > 0)) return []

  const { left, top, right, bottom } = vis
  if (!(right > left) || !(bottom > top)) return []

  // Artboard edges clamped into the visible band.
  const aTop = Math.min(Math.max(0, top), bottom)
  const aBottom = Math.min(Math.max(artH, top), bottom)
  const aLeft = Math.min(Math.max(0, left), right)
  const aRight = Math.min(Math.max(artW, left), right)

  const rects: VeilRect[] = []
  const push = (key: string, x: number, y: number, w: number, h: number) => {
    if (w > 0 && h > 0) rects.push({ key, x, y, width: w, height: h })
  }

  push("veil-top", left, top, right - left, aTop - top)
  push("veil-bottom", left, aBottom, right - left, bottom - aBottom)
  push("veil-left", left, aTop, aLeft - left, aBottom - aTop)
  push("veil-right", aRight, aTop, right - aRight, aBottom - aTop)

  return rects
}
