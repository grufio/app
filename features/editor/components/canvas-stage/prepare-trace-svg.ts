/**
 * Prepare a vtracer-emitted SVG for inline rendering as a transparent
 * overlay above the filter chain tip in the canvas:
 *
 * - Strip the `<?xml ... ?>` declaration so the markup is valid
 *   inside an HTML host document.
 * - Drop the root `<svg>`'s `width=/height=` attributes and replace
 *   with `width="100%" height="100%" preserveAspectRatio="none"` so
 *   the SVG fills its (already pixel-sized) wrapper div instead of
 *   rendering at its intrinsic image-pixel dimensions.
 * - Remove the opaque white background `<rect>` that the Python
 *   pipeline emits — the trace is now an overlay above the filter
 *   chain tip, so the underlying image must show through.
 * - Annotate every `<path>` with `data-trace-region=""` and
 *   `data-fill="<original fill>"` so the trace overlay can click-
 *   highlight the region + every other region sharing the same
 *   fill color (paint-by-numbers grouping).
 * - Replace each `<path>` fill with `transparent`. The original
 *   color is preserved in `data-fill` for the click-highlight match
 *   and the filter image now provides the visible colors.
 * - For numerate paths (which vtracer emits without a stroke), add
 *   a default black stroke so the region outlines stay visible
 *   above the filter image. Lineart paths already carry their own
 *   stroke (`stroke="black" stroke-width="X"` from vectorise.py).
 *
 * Regex-based on purpose — runs in vitest without a DOM environment,
 * and our trace SVGs come from a deterministic Python pipeline (no
 * nested quoting or entity-encoded attrs to worry about).
 */
export type PreparedTraceSvg = {
  /** Markup ready to inject via `dangerouslySetInnerHTML`. */
  html: string
}

const XML_DECL_RE = /<\?xml[^>]*\?>/
const SVG_OPEN_RE = /<svg\b([^>]*)>/i
// White background `<rect width="W" height="H" fill="white"/>` that
// the Python pipeline emits as the first child of <svg>. Stripped
// so the underlying filter image shows through.
const WHITE_BG_RECT_RE = /<rect\b[^>]*\bfill\s*=\s*"(?:white|#fff|#ffffff)"[^>]*\/?>\s*/i
const PATH_OPEN_RE = /<path\b([^/>]*?)\s*(\/?)>/gi
const FILL_ATTR_RE = /\bfill\s*=\s*"([^"]*)"/i
const STROKE_ATTR_RE = /\bstroke\s*=\s*"[^"]*"/i
const WIDTH_ATTR_RE = /\bwidth\s*=\s*"[^"]*"/i
const HEIGHT_ATTR_RE = /\bheight\s*=\s*"[^"]*"/i

export function prepareTraceSvg(svgText: string): PreparedTraceSvg | null {
  if (!svgText) return null
  let svg = svgText.replace(XML_DECL_RE, "").trim()

  const openMatch = SVG_OPEN_RE.exec(svg)
  if (!openMatch) return null

  // Strip width/height from <svg> root + reset to 100% so the SVG
  // fills its wrapper div rather than rendering at intrinsic px.
  svg = svg.replace(SVG_OPEN_RE, (_full, attrs: string) => {
    const cleaned = attrs.replace(WIDTH_ATTR_RE, "").replace(HEIGHT_ATTR_RE, "")
    return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="none">`
  })

  // Drop the white background rect — overlay model.
  svg = svg.replace(WHITE_BG_RECT_RE, "")

  // Annotate every <path>, transparency-swap its fill, ensure it
  // has a default stroke so outlines remain visible.
  svg = svg.replace(PATH_OPEN_RE, (_full, attrs: string, slash: string) => {
    const fillMatch = FILL_ATTR_RE.exec(attrs)
    const fill = fillMatch ? fillMatch[1] : ""
    const attrsWithoutFill = attrs.replace(FILL_ATTR_RE, "")
    const hasStroke = STROKE_ATTR_RE.test(attrsWithoutFill)
    const defaultStroke = hasStroke ? "" : ` stroke="black" stroke-width="1"`
    return `<path${attrsWithoutFill} fill="transparent"${defaultStroke} data-trace-region="" data-fill="${fill}" ${slash}>`
  })

  return { html: svg }
}
