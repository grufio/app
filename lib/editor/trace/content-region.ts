/**
 * Trace content-region geometry (pure).
 *
 * A trace only converts the printable **content rect = artboard − padding**.
 * The traced input is a canvas the size of the content rect, filled WHITE, with
 * the placed image composited where it covers — uncovered areas stay white.
 *
 * This module computes, from the artboard + padding + the image's placement on
 * the artboard + the image's intrinsic pixels, a compositing plan:
 *   - the output canvas size (content rect at the image's source-pixel density,
 *     so the covered image portion is composited 1:1 — no image resampling),
 *   - which sub-rect of the source image to extract and where to place it on
 *     the white canvas (clipped to the canvas),
 *   - the coverage ("full" | "partial" | "none"), used to warn the user, and
 *   - the content rect on the artboard (px) for the trace's display rect.
 *
 * All inputs are in px (artboard px = 1/72 inch; source px = the image's own
 * pixels). Rotation is out of scope (handled by the layer, independent of crop).
 */
export type PaddingPx = { topPx: number; bottomPx: number; leftPx: number; rightPx: number }

/** Image display rectangle on the artboard, top-left anchored (px). */
export type ImageRectPx = { leftPx: number; topPx: number; widthPx: number; heightPx: number }

export type ContentRegionPlan = {
  ok: true
  /** Content rect on the artboard (top-left, px) — the trace's display rect. */
  contentRectPx: { xPx: number; yPx: number; widthPx: number; heightPx: number }
  /** Output canvas (white base) at the image's source-pixel density. */
  canvasPx: { widthPx: number; heightPx: number }
  /** Sub-rect of the SOURCE image to extract, and where to composite it on the
   * white canvas. Null when the image does not cover the content rect at all. */
  composite:
    | { extract: { left: number; top: number; width: number; height: number }; placeAt: { left: number; top: number } }
    | null
  coverage: "full" | "partial" | "none"
}

export type ContentRegionFailure = { ok: false; reason: string }

/** A resolved content region for the configure PREVIEW: the successful plan +
 * the content-rect display size in mm (drives the preview grid, parity with the
 * server's `region.displayMmW/H`). */
export type TraceContentRegion = {
  plan: Extract<ContentRegionPlan, { ok: true }>
  displayMmW: number
  displayMmH: number
}

const r = Math.round

export function computeContentRegionPlan(args: {
  artboardWPx: number
  artboardHPx: number
  padding: PaddingPx
  image: ImageRectPx
  intrinsicWPx: number
  intrinsicHPx: number
}): ContentRegionPlan | ContentRegionFailure {
  const { artboardWPx, artboardHPx, padding, image, intrinsicWPx, intrinsicHPx } = args

  if (!(artboardWPx > 0) || !(artboardHPx > 0)) return { ok: false, reason: "Invalid artboard size" }
  if (!(image.widthPx > 0) || !(image.heightPx > 0)) return { ok: false, reason: "Invalid image display size" }
  if (!(intrinsicWPx > 0) || !(intrinsicHPx > 0)) return { ok: false, reason: "Invalid image intrinsic size" }

  // Content rect on the artboard (clamp padding so it can't invert).
  const padL = Math.max(0, Math.min(padding.leftPx, artboardWPx))
  const padR = Math.max(0, Math.min(padding.rightPx, artboardWPx - padL))
  const padT = Math.max(0, Math.min(padding.topPx, artboardHPx))
  const padB = Math.max(0, Math.min(padding.bottomPx, artboardHPx - padT))
  const contentX0 = padL
  const contentY0 = padT
  const contentWPx = artboardWPx - padL - padR
  const contentHPx = artboardHPx - padT - padB
  if (!(contentWPx > 0) || !(contentHPx > 0)) {
    return { ok: false, reason: "Content area is empty (padding too large)" }
  }

  const contentRectPx = { xPx: contentX0, yPx: contentY0, widthPx: contentWPx, heightPx: contentHPx }

  // Source pixels per artboard pixel (the image's density on the artboard).
  const sx = intrinsicWPx / image.widthPx
  const sy = intrinsicHPx / image.heightPx

  // Output canvas = content rect at source-pixel density (image composited 1:1).
  const canvasW = Math.max(1, r(contentWPx * sx))
  const canvasH = Math.max(1, r(contentHPx * sy))

  // Where the image's (0,0) lands on the canvas (source-density px).
  const placeX = (image.leftPx - contentX0) * sx
  const placeY = (image.topPx - contentY0) * sy

  // Clip the placed image to the canvas.
  const visLeft = Math.max(0, placeX)
  const visTop = Math.max(0, placeY)
  const visRight = Math.min(canvasW, placeX + intrinsicWPx)
  const visBottom = Math.min(canvasH, placeY + intrinsicHPx)

  let composite: ContentRegionPlan["composite"] = null
  let coverage: ContentRegionPlan["coverage"] = "none"

  if (visRight > visLeft && visBottom > visTop) {
    const placeLeft = r(visLeft)
    const placeTop = r(visTop)
    composite = {
      extract: {
        left: Math.max(0, r(visLeft - placeX)),
        top: Math.max(0, r(visTop - placeY)),
        width: Math.max(1, r(visRight - visLeft)),
        height: Math.max(1, r(visBottom - visTop)),
      },
      placeAt: { left: placeLeft, top: placeTop },
    }
    // Fully covered iff the image spans the whole canvas on every edge.
    const full = placeX <= 0 && placeY <= 0 && placeX + intrinsicWPx >= canvasW && placeY + intrinsicHPx >= canvasH
    coverage = full ? "full" : "partial"
  }

  return { ok: true, contentRectPx, canvasPx: { widthPx: canvasW, heightPx: canvasH }, composite, coverage }
}
