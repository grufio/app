/**
 * Trace-overlay geometry — the trace is a fully standalone layer.
 *
 * Once applied, the trace owns its complete world rect — SIZE *and*
 * POSITION — frozen from the display rect that was authoritative at apply
 * time (`project_image_trace.display_*_px_u`). That rect is the
 * `project_image_state` row read by the trace server when it sized the
 * pixelate grid (see `services/editor/server/trace/index.ts` +
 * `.../trace/pixelate.ts`). It is NOT derived from the live base-image
 * transform at render time.
 *
 * Why size is decoupled: `TraceInlineSvg` sizes its DOM container purely
 * from the rect it is given (`width * view.scale`), and the Python SVG
 * fills that container with `preserveAspectRatio="none"` (near-square
 * viewBox, so it cannot enforce its own aspect). Feeding the container the
 * live `imageTx`-derived rect (the original behaviour) coupled the
 * rendered aspect to a reset-prone transform; a 6×6 grid on a 200×100
 * resize then stretched. Feeding it the trace's OWN frozen size makes the
 * rendered aspect equal the apply-time resize, regardless of how `imageTx`
 * later changes.
 *
 * Why position is decoupled (the "trace sticks in the source image" bug):
 * the original code positioned the overlay at the LIVE base-image centre
 * (`imageRender.x/y`, tracked via `traceOverlayCenter`). So moving/resizing
 * the base image dragged the trace with it, and the trace never showed at
 * its own apply-time origin — it was glued to the source image. The trace
 * is a standalone layer: its world position is its own frozen
 * `display_x/y`, full stop. Pan/zoom is applied on top by the caller via
 * the stage `view` transform (in `TraceInlineSvg`), which is independent of
 * the base image — so the overlay still pans/zooms with the canvas without
 * being anchored to the base-image rect.
 *
 * Coordinate space: `display_*_px_u` is µpx (1px = 1e6 µpx), the SAME
 * space as the canvas `imageTx`. `pxUToPxNumber` (= Number/1e6) converts to
 * world px identically, so the trace rect lands byte-consistent with what
 * `imageRender` would have produced from the equivalent state. `display_x/y`
 * is a world-space CENTRE (matching `imageTx.x/y` / Konva's centred image
 * node), so the returned rect's `x/y` is a centre too.
 *
 * Legacy/lineart signal: `display_width_px_u === "0"` (the column DEFAULT,
 * and what every pre-stage-2 pixelate row + every lineart row carries)
 * means "no fixed rect" → `resolveTraceOverlayRect` falls back to the live
 * image rect (both size AND position), so existing/lineart traces keep
 * their prior behaviour and do not break.
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

/** A world-space rect: `x/y` is the CENTRE, `width/height` the extent. */
export type TraceWorldRect = { x: number; y: number; width: number; height: number }

function parsePositivePxU(value: string | null | undefined): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const v = BigInt(value)
    return v > 0n ? v : null
  } catch {
    return null
  }
}

/** Parse a µpx value that is allowed to be zero or negative (a position,
 * not an extent). Returns null only for missing/garbage input. */
function parsePxU(value: string | null | undefined): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    return BigInt(value)
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

/**
 * Resolve the trace overlay's full world rect (centre x/y + size) as a
 * STANDALONE layer, decoupled from the live base image.
 *
 * - Valid display rect (positive width+height): the rect is the trace's
 *   OWN frozen geometry — `display_x/y` for the centre, `display_w/h` for
 *   the size. The base-image rect is ignored entirely.
 * - Legacy/lineart "0" signal (or garbage): returns the live `imageRender`
 *   rect unchanged, preserving prior behaviour for traces that never froze
 *   a rect.
 *
 * Returns null only when there is no image rect to fall back to and the
 * display rect is also unusable (nothing to render).
 *
 * NOTE: this is world-space only. Pan/zoom (`view`) is applied downstream
 * by `TraceInlineSvg`; do not fold the stage transform in here.
 */
export function resolveTraceOverlayRect(
  displayRect: TraceDisplayRectPxU | null | undefined,
  imageRender: TraceWorldRect | null | undefined,
): TraceWorldRect | null {
  const size = resolveTraceWorldSize(displayRect)
  if (!size) {
    // Legacy/lineart: no frozen rect → fall back to the live image rect
    // (size AND position), exactly as before this layer existed.
    return imageRender ?? null
  }
  // Standalone layer: own position from display_x/y (a world centre,
  // same space as imageTx.x/y), own size from display_w/h. Independent of
  // the base image's live transform.
  const xPxU = parsePxU(displayRect!.display_x_px_u)
  const yPxU = parsePxU(displayRect!.display_y_px_u)
  return {
    x: xPxU != null ? pxUToPxNumber(xPxU) : (imageRender?.x ?? 0),
    y: yPxU != null ? pxUToPxNumber(yPxU) : (imageRender?.y ?? 0),
    width: size.width,
    height: size.height,
  }
}
