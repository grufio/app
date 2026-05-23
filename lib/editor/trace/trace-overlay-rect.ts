/**
 * Trace-overlay geometry (Invariant 2 + 3, stage 3).
 *
 * The trace overlay is a standalone object: once applied, its SIZE/ASPECT
 * is frozen from the display rect that was authoritative at apply time
 * (`project_image_trace.display_*_px_u`, written by the trace server from
 * the same `project_image_state` read that sized the pixelate grid — see
 * `services/editor/server/trace/index.ts` + `.../trace/pixelate.ts`).
 *
 * Why this decouples the stretch: `TraceInlineSvg` sizes its DOM container
 * purely from the rect it is given (`width * view.scale`), and the Python
 * SVG fills that container with `preserveAspectRatio="none"` (near-square
 * viewBox, so it cannot enforce its own aspect). Feeding the container the
 * live `imageTx`-derived rect (the old behaviour) coupled the rendered
 * aspect to a reset-prone transform; a 6×6 grid on a 200×100 resize then
 * stretched. Feeding it the trace's OWN frozen size makes the rendered
 * aspect equal the resize, regardless of how `imageTx` later changes.
 *
 * Coordinate space: `display_*_px_u` is µpx (1px = 1e6 µpx), the SAME
 * space as the canvas `imageTx`. `pxUToPxNumber` (= Number/1e6) converts
 * both to world px identically, so the trace size lands byte-consistent
 * with what `imageRender` would have produced from the equivalent state.
 *
 * Position (x/y) is NOT taken from here — it follows the live image so the
 * overlay stays glued to the base image during drag/pan/zoom (preserves
 * #153). The caller supplies the live world-center; this module only
 * decides the frozen SIZE (and whether a fixed size exists at all).
 *
 * Legacy/lineart signal: `display_width_px_u === "0"` (the column DEFAULT,
 * and what every pre-stage-2 pixelate row + every lineart row carries)
 * means "no fixed rect" → the caller renders via the legacy path (size
 * from `imageRender`), so existing/lineart traces keep their prior
 * behaviour and do not break.
 */
import { pxUToPxNumber } from "@/lib/editor/units"

/** The four text-encoded µpx fields off a `ProjectTrace` row. */
export type TraceDisplayRectPxU = {
  display_x_px_u: string
  display_y_px_u: string
  display_width_px_u: string
  display_height_px_u: string
}

/** The trace's frozen world-px size, or null when the trace carries no
 * fixed rect (legacy/lineart "0" signal) — caller falls back to the live
 * image rect. */
export type TraceWorldSize = { width: number; height: number }

function parsePositivePxU(value: string | null | undefined): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const v = BigInt(value)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

/**
 * Resolve the trace overlay's frozen world-px SIZE from its persisted
 * display rect. Returns null for the legacy/lineart "0" signal (or any
 * non-positive/garbage value), which tells the caller to keep the prior
 * behaviour (size from the live image rect).
 */
export function resolveTraceWorldSize(
  rect: TraceDisplayRectPxU | null | undefined,
): TraceWorldSize | null {
  if (!rect) return null
  const w = parsePositivePxU(rect.display_width_px_u)
  const h = parsePositivePxU(rect.display_height_px_u)
  if (!w || !h) return null
  return { width: pxUToPxNumber(w), height: pxUToPxNumber(h) }
}
