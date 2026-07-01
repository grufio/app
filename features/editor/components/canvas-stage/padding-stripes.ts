/**
 * Padding-margin geometry (pure).
 *
 * The artboard print padding (distance from the image area to the page, per
 * side, in px) rendered as four preview strips over the artboard (a white veil
 * that lightens the underlying image — the region the later autocrop trims).
 * Strips are computed so corners are covered exactly once (top/bottom span the
 * full width; left/right span only the middle band) — otherwise a
 * semi-transparent fill would over-lighten the corners.
 *
 * `computePaddingContentRect` returns the inner printable rectangle (the veil's
 * inner edge) so the canvas can stroke a hairline border along it.
 *
 * Each side is clamped so the strips never exceed the artboard or go negative.
 */
export type PaddingPx = { top: number; bottom: number; left: number; right: number }

export type PaddingStripe = { key: string; x: number; y: number; width: number; height: number }

export type PaddingContentRect = { x: number; y: number; width: number; height: number }

/** Clamp each side so the padding never exceeds the artboard or goes negative. */
function clampPadding(artW: number, artH: number, pad: PaddingPx) {
  const left = Math.max(0, Math.min(pad.left, artW))
  const right = Math.max(0, Math.min(pad.right, artW - left))
  const top = Math.max(0, Math.min(pad.top, artH))
  const bottom = Math.max(0, Math.min(pad.bottom, artH - top))
  return { left, right, top, bottom }
}

export function computePaddingStripes(artW: number, artH: number, pad: PaddingPx): PaddingStripe[] {
  if (!(artW > 0) || !(artH > 0)) return []

  const { left: padL, right: padR, top: padT, bottom: padB } = clampPadding(artW, artH, pad)

  const stripes: PaddingStripe[] = []
  if (padT > 0) stripes.push({ key: "pad-top", x: 0, y: 0, width: artW, height: padT })
  if (padB > 0) stripes.push({ key: "pad-bottom", x: 0, y: artH - padB, width: artW, height: padB })

  const midH = Math.max(0, artH - padT - padB)
  if (padL > 0 && midH > 0) stripes.push({ key: "pad-left", x: 0, y: padT, width: padL, height: midH })
  if (padR > 0 && midH > 0) stripes.push({ key: "pad-right", x: artW - padR, y: padT, width: padR, height: midH })

  return stripes
}

/**
 * Inner printable rectangle = artboard minus padding. Returns `null` when there
 * is no padding on any side (no inner frame to draw) or the content would be
 * degenerate (zero-sized), so callers can skip the hairline border entirely.
 */
export function computePaddingContentRect(artW: number, artH: number, pad: PaddingPx): PaddingContentRect | null {
  if (!(artW > 0) || !(artH > 0)) return null

  const { left: padL, right: padR, top: padT, bottom: padB } = clampPadding(artW, artH, pad)
  if (padL <= 0 && padR <= 0 && padT <= 0 && padB <= 0) return null

  const width = Math.max(0, artW - padL - padR)
  const height = Math.max(0, artH - padT - padB)
  if (width <= 0 || height <= 0) return null

  return { x: padL, y: padT, width, height }
}
