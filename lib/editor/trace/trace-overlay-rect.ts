/**
 * Trace-overlay geometry — the trace HANGS ON the base image for POSITION,
 * but keeps its own FROZEN SIZE.
 *
 * Once applied, the trace's SIZE is frozen from the display rect that was
 * authoritative at apply time (`project_image_trace.display_*_px_u`). That
 * rect is the `project_image_state` row read by the trace server when it
 * sized the pixelate grid (see `services/editor/server/trace/index.ts` +
 * `.../trace/pixelate.ts`). Its POSITION, however, follows the live base
 * image at render time.
 *
 * Why size is frozen (decoupled from the live transform): `TraceInlineSvg`
 * sizes its DOM container purely from the rect it is given
 * (`width * view.scale`), and the Python SVG fills that container with
 * `preserveAspectRatio="none"` (near-square viewBox, so it cannot enforce
 * its own aspect). Feeding the container the live `imageTx`-derived SIZE
 * (the original behaviour) coupled the rendered aspect to the base image; a
 * later non-uniform resize (e.g. back to square) then stretched the trace —
 * the ~30-PR aspect bug, now guarded by `e2e/trace-overlay-aspect.spec.ts`
 * Assert C-2. Feeding it the trace's OWN frozen size makes the rendered
 * aspect equal the apply-time resize, regardless of how `imageTx` later
 * changes.
 *
 * Why position is FROZEN too (content-rect traces): a trace now converts only
 * the printable content rect (artboard − padding), which is fixed on the
 * ARTBOARD — not centred on the image. So the trace is locked to that content
 * rect: POSITION = the frozen centre `display_x/y`, decoupled from the live
 * image. Moving/resizing the base image does NOT move the trace (it stays in
 * the content rect it converted). Pan/zoom is applied on top by the caller via
 * the stage `view` transform (in `TraceInlineSvg`) — the whole canvas pans, so
 * the trace pans with it. The image-drag position patch only applies to legacy
 * "0" rects (which still follow the live image, below).
 *
 * (Earlier this layer followed the live image centre — correct only for the old
 * image-centred crop. With the content-rect crop that reasoning inverts, so the
 * frozen position is now the correct anchor.)
 *
 * Coordinate space: `display_*_px_u` is µpx (1px = 1e6 µpx), the SAME
 * space as the canvas `imageTx`. `pxUToPxNumber` (= Number/1e6) converts to
 * world px identically. `display_x/y` (the at-rest fallback when there is no
 * live image) is a world-space CENTRE matching `imageTx.x/y` / Konva's
 * centred image node, so the returned rect's `x/y` is a centre too.
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
 * Resolve the trace overlay's full world rect (centre x/y + size): the trace
 * **hangs on the base image** for POSITION but keeps its **frozen SIZE**.
 *
 * - Valid display rect (positive width+height):
 *   - POSITION = the live base image centre (`imageRender.x/y`). The trace
 *     moves/pans/zooms with the image — it is glued to it, not pinned to a
 *     stale apply-time origin.
 *   - SIZE = the trace's OWN frozen `display_w/h`. A later non-uniform image
 *     resize must NOT stretch the trace (that was the ~30-PR aspect bug;
 *     `e2e/trace-overlay-aspect.spec.ts` Assert C-2 guards it). So size is
 *     decoupled from the live image even though position follows it.
 *   When `imageRender` is absent (no live image to anchor to) we fall back to
 *   the frozen `display_x/y` so the trace still renders somewhere sensible.
 * - Legacy/lineart "0" signal (or garbage): returns the live `imageRender`
 *   rect unchanged (size AND position), preserving prior behaviour for traces
 *   that never froze a rect.
 *
 * Returns null only when there is no image rect to fall back to and the
 * display rect is also unusable (nothing to render).
 *
 * NOTE: this is world-space only, and it is the AT-REST answer. Pan/zoom
 * (`view`) is applied downstream by `TraceInlineSvg`; the live-drag follow
 * (where `imageRender` lags until drag-commit) is patched by the caller via a
 * render-only world-px offset — never by mutating `imageTx`.
 */
export function resolveTraceOverlayRect(
  displayRect: TraceDisplayRectPxU | null | undefined,
  imageRender: TraceWorldRect | null | undefined,
): TraceWorldRect | null {
  const size = resolveTraceWorldSize(displayRect)
  if (!size) {
    // Legacy "0" rect (pre-content-rect rows): no frozen rect → fall back to
    // the live image rect (size AND position), exactly as before this layer.
    return imageRender ?? null
  }
  // Content-rect trace: the trace is anchored to the printable content rect on
  // the ARTBOARD (artboard − padding), decoupled from the live image. Both
  // POSITION (frozen centre `display_x/y`) and SIZE (frozen `display_w/h`) come
  // from the frozen rect, so moving/resizing the base image does NOT move the
  // trace — it stays in the content rect it converted. (Pan/zoom is applied
  // downstream via the stage `view`, so the trace still pans/zooms with the
  // whole canvas.)
  const xPxU = parsePxU(displayRect!.display_x_px_u)
  const yPxU = parsePxU(displayRect!.display_y_px_u)
  return {
    x: xPxU != null ? pxUToPxNumber(xPxU) : (imageRender?.x ?? 0),
    y: yPxU != null ? pxUToPxNumber(yPxU) : (imageRender?.y ?? 0),
    width: size.width,
    height: size.height,
  }
}
