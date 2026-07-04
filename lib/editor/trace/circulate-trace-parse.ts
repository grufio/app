/**
 * Parse an APPLIED circulate trace SVG (from the Python filter service) into the
 * geometry the Konva overlay needs to render crisp, zoom-stable circles + frames.
 *
 * The result SVG (`filter-service/app/circulate.py`) looks like:
 *
 *   <svg ... viewBox="0 0 {cropped_w_px} {cropped_h_px}">
 *     <g id="cells">
 *       <g data-cell="x,y">
 *         <ellipse cx cy rx ry fill="#rrggbb" [stroke="black" stroke-width="C"]/>  (outer)
 *         <ellipse cx cy rx ry fill="#rrggbb" [stroke=...]/>                        (inner, optional)
 *       </g> ...
 *     </g>
 *     <g id="frames">
 *       <ellipse cx cy rx ry fill="none" stroke="black" stroke-width="1"/> ...      (one per cell)
 *     </g>
 *     <g id="numbers"> ... </g>   (optional; NOT parsed — stays in the DOM overlay)
 *   </svg>
 *
 * We render cells (filled ellipses, + optional per-cell contour stroke) and frames
 * (thin outlines) on the Konva canvas, and leave the numbers group in the DOM
 * overlay on top. Only circulate carries `<g id="frames">` (exclusive vs pixelate's
 * `<g id="grid">`); pixelate/lineart return `null` here so this overlay stays inert.
 *
 * All coordinates are in crop-pixel (viewBox) space. Regex-based on purpose (mirrors
 * `pixelate-trace-parse.ts`): the SVG comes from a deterministic Python pipeline and
 * this must run in vitest without a DOM. We split ellipses by `fill` (hex = a filled
 * cell; `none` = a frame outline) rather than by group boundary, so the nested
 * `<g data-cell>` wrappers don't trip a non-greedy group regex.
 */
export type CirculateCellEllipse = {
  cx: number
  cy: number
  rx: number
  ry: number
  /** "#rrggbb" */
  fill: string
  /** Optional per-cell contour stroke width in crop-px (0 = none). Scales with the image. */
  contour: number
}

export type CirculateFrameEllipse = { cx: number; cy: number; rx: number; ry: number }

export type ParsedCirculateTrace = {
  viewBoxW: number
  viewBoxH: number
  /** Filled ellipses (outer + optional inner), in draw order. */
  cells: CirculateCellEllipse[]
  /** Thin outline ellipses — one per cell, drawn on top (always 1px on canvas). */
  frames: CirculateFrameEllipse[]
}

const VIEWBOX_RE = /viewBox="0 0 ([\d.]+) ([\d.]+)"/
const FRAMES_GROUP_RE = /<g id="frames"[^>]*>/i
const ELLIPSE_TAG_RE = /<ellipse\b[^>]*>/gi

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]+)"`).exec(tag)
  return m ? m[1] : null
}
function numAttr(tag: string, name: string): number {
  const v = attr(tag, name)
  return v == null ? NaN : Number(v)
}

/**
 * Parse the circulate trace SVG. Returns `null` when it is not a circulate trace
 * (no `<g id="frames">`), the viewBox is missing, or no filled cells were found —
 * in all those cases the Konva overlay renders nothing and the SVG overlay is left be.
 */
export function parseCirculateTraceSvg(svgText: string | null | undefined): ParsedCirculateTrace | null {
  if (!svgText) return null
  if (!FRAMES_GROUP_RE.test(svgText)) return null // not circulate (pixelate has <g id="grid">)

  const vb = VIEWBOX_RE.exec(svgText)
  if (!vb) return null
  const viewBoxW = Number(vb[1])
  const viewBoxH = Number(vb[2])
  if (!(viewBoxW > 0) || !(viewBoxH > 0)) return null

  const cells: CirculateCellEllipse[] = []
  const frames: CirculateFrameEllipse[] = []
  ELLIPSE_TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ELLIPSE_TAG_RE.exec(svgText)) !== null) {
    const tag = m[0]
    const cx = numAttr(tag, "cx")
    const cy = numAttr(tag, "cy")
    const rx = numAttr(tag, "rx")
    const ry = numAttr(tag, "ry")
    if (![cx, cy, rx, ry].every((n) => Number.isFinite(n))) continue
    const fill = attr(tag, "fill")
    if (fill && fill !== "none") {
      const sw = attr(tag, "stroke-width")
      cells.push({ cx, cy, rx, ry, fill, contour: sw ? Number(sw) : 0 })
    } else {
      frames.push({ cx, cy, rx, ry })
    }
  }

  if (cells.length === 0) return null
  return { viewBoxW, viewBoxH, cells, frames }
}
