/**
 * Editor service: canvas world size (UI-agnostic).
 *
 * Responsibilities:
 * - Compute the logical "world" dimensions used for view math (fit/pan/zoom).
 * - Prefer explicit artboard size, otherwise fall back to intrinsic image size, then DOM-measured size.
 */
export function computeWorldSize(opts: {
  artboardWidthPx?: number
  artboardHeightPx?: number
  intrinsicWidthPx?: number
  intrinsicHeightPx?: number
  domWidthPx?: number
  domHeightPx?: number
}): { w: number; h: number } | null {
  const artW = opts.artboardWidthPx
  const artH = opts.artboardHeightPx
  if (Number.isFinite(artW) && Number(artW) > 0 && Number.isFinite(artH) && Number(artH) > 0) {
    return { w: Number(artW), h: Number(artH) }
  }

  const iw = opts.intrinsicWidthPx
  const ih = opts.intrinsicHeightPx
  if (Number.isFinite(iw) && Number(iw) > 0 && Number.isFinite(ih) && Number(ih) > 0) {
    return { w: Number(iw), h: Number(ih) }
  }

  const dw = opts.domWidthPx
  const dh = opts.domHeightPx
  if (Number.isFinite(dw) && Number(dw) > 0 && Number.isFinite(dh) && Number(dh) > 0) {
    return { w: Number(dw), h: Number(dh) }
  }

  return null
}

