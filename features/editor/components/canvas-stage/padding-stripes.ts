/**
 * Padding-margin geometry (pure).
 *
 * The artboard print padding (distance from the image area to the page, per
 * side, in px) rendered as four grey preview strips over the artboard. Strips
 * are computed so corners are covered exactly once (top/bottom span the full
 * width; left/right span only the middle band) — otherwise a semi-transparent
 * fill would darken the corners.
 *
 * Each side is clamped so the strips never exceed the artboard or go negative.
 */
export type PaddingPx = { top: number; bottom: number; left: number; right: number }

export type PaddingStripe = { key: string; x: number; y: number; width: number; height: number }

export function computePaddingStripes(artW: number, artH: number, pad: PaddingPx): PaddingStripe[] {
  if (!(artW > 0) || !(artH > 0)) return []

  const padL = Math.max(0, Math.min(pad.left, artW))
  const padR = Math.max(0, Math.min(pad.right, artW - padL))
  const padT = Math.max(0, Math.min(pad.top, artH))
  const padB = Math.max(0, Math.min(pad.bottom, artH - padT))

  const stripes: PaddingStripe[] = []
  if (padT > 0) stripes.push({ key: "pad-top", x: 0, y: 0, width: artW, height: padT })
  if (padB > 0) stripes.push({ key: "pad-bottom", x: 0, y: artH - padB, width: artW, height: padB })

  const midH = Math.max(0, artH - padT - padB)
  if (padL > 0 && midH > 0) stripes.push({ key: "pad-left", x: 0, y: padT, width: padL, height: midH })
  if (padR > 0 && midH > 0) stripes.push({ key: "pad-right", x: artW - padR, y: padT, width: padR, height: midH })

  return stripes
}
