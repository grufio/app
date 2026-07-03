/**
 * Trace-overlay geometry — the trace is ANCHORED to the artboard content rect.
 *
 * A trace converts only the printable content rect (artboard − padding), which
 * is fixed on the ARTBOARD. So the overlay's POSITION and SIZE both come from
 * the frozen rect the server persisted at apply time
 * (`project_image_trace.display_*_px_u`, a world-space CENTRE + extent):
 * moving/resizing the base image does NOT move the trace — it stays in the
 * content rect it converted. Pan/zoom is applied downstream by the caller via
 * the stage `view` transform (`TraceInlineSvg`), so the whole canvas — image +
 * trace — pans/zooms together.
 *
 * Why size is frozen (not derived from the live image): `TraceInlineSvg` sizes
 * its DOM container from the given rect (`width * view.scale`), and the Python
 * SVG fills it with `preserveAspectRatio="none"`. Deriving the size from the
 * live `imageTx` coupled the rendered aspect to the image; a later non-uniform
 * resize then stretched the trace (the ~30-PR aspect bug, guarded by
 * `e2e/trace-overlay-aspect.spec.ts` Assert C-2). The frozen size keeps the
 * apply-time aspect regardless of later `imageTx` changes.
 *
 * Coordinate space: `display_*_px_u` is µpx (1px = 1e6 µpx), the SAME space as
 * the canvas `imageTx`; `pxUToPxNumber` (= Number/1e6) converts to world px.
 * `display_x/y` is a world-space CENTRE (Konva's centred node), so the returned
 * rect's `x/y` is a centre too.
 */
import { pxUToPxNumber } from "@/lib/editor/units"

/** The four text-encoded µpx fields off a `ProjectTrace` row. */
export type TraceDisplayRectPxU = {
  display_x_px_u: string
  display_y_px_u: string
  display_width_px_u: string
  display_height_px_u: string
}

/** The trace's frozen world-px size, or null when the rect is missing/invalid. */
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

/** Parse a µpx value that is allowed to be zero or negative (a position, not an
 * extent). Returns null only for missing/garbage input. */
function parsePxU(value: string | null | undefined): bigint | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

/**
 * Resolve the trace overlay's frozen world-px SIZE from its persisted display
 * rect. Returns null when the rect is missing or its width/height are
 * non-positive/garbage (nothing valid to render).
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
 * Resolve the trace overlay's full world rect (frozen centre x/y + size),
 * anchored to the artboard content rect. Returns null when the display rect
 * carries no valid frozen size (nothing to render). Pan/zoom is applied
 * downstream via the stage `view`.
 */
export function resolveTraceOverlayRect(
  displayRect: TraceDisplayRectPxU | null | undefined,
): TraceWorldRect | null {
  const size = resolveTraceWorldSize(displayRect)
  if (!size) return null
  const xPxU = parsePxU(displayRect!.display_x_px_u)
  const yPxU = parsePxU(displayRect!.display_y_px_u)
  return {
    x: xPxU != null ? pxUToPxNumber(xPxU) : 0,
    y: yPxU != null ? pxUToPxNumber(yPxU) : 0,
    width: size.width,
    height: size.height,
  }
}

/** A top-left world-px rect: `x/y` is the CORNER (not the centre). */
export type TraceClipRect = { x: number; y: number; width: number; height: number }

/**
 * Resolve the trace's content rect as a TOP-LEFT world-px rect, for a Konva
 * clip. Same frozen content rect as the overlay (`resolveTraceOverlayRect`),
 * just corner-anchored (centre − extent/2) so the base bitmap can be clipped to
 * exactly the region the overlay covers. Returns null when there is no trace
 * (nothing to clip). Keyed on trace EXISTENCE, decoupled from image + overlay
 * visibility.
 */
export function resolveTraceClipRect(
  displayRect: TraceDisplayRectPxU | null | undefined,
): TraceClipRect | null {
  const rect = resolveTraceOverlayRect(displayRect)
  if (!rect) return null
  return {
    x: rect.x - rect.width / 2,
    y: rect.y - rect.height / 2,
    width: rect.width,
    height: rect.height,
  }
}
