/**
 * Prepare a vtracer-emitted SVG for inline rendering as an
 * interactive overlay above the filter chain tip in the canvas:
 *
 * - Strip the `<?xml ... ?>` declaration so the markup is valid
 *   inside an HTML host document.
 * - Drop the root `<svg>`'s `width=/height=` attributes and replace
 *   with `width="100%" height="100%" preserveAspectRatio="none"` so
 *   the SVG fills its (already pixel-sized) wrapper div instead of
 *   rendering at its intrinsic image-pixel dimensions.
 * - Remove the opaque white background `<rect>` that the Python
 *   pipeline emits. The trace is an overlay above the filter tip;
 *   if the user later toggles the region fills off, the filter
 *   image needs to be reachable through the SVG without a white
 *   sheet hiding it.
 * - Annotate every `<path>` with `data-trace-region=""` and
 *   `data-fill="<original fill>"` so the overlay can click-
 *   highlight the region + every other region sharing the same
 *   fill color (paint-by-numbers grouping). The original fill stays
 *   intact so the cells show their detected RGB colors at rest.
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
// the Python pipeline emits as the first child of <svg>. Stripped so
// the underlying filter image can show through when the user toggles
// region fills off (future feature).
const WHITE_BG_RECT_RE = /<rect\b[^>]*\bfill\s*=\s*"(?:white|#fff|#ffffff)"[^>]*\/?>\s*/i
const PATH_OPEN_RE = /<path\b([^/>]*?)\s*(\/?)>/gi
const FILL_ATTR_RE = /\bfill\s*=\s*"([^"]*)"/i
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

  // Annotate every <path>; keep its original fill so the cell still
  // shows the detected RGB color at rest.
  svg = svg.replace(PATH_OPEN_RE, (_full, attrs: string, slash: string) => {
    const fillMatch = FILL_ATTR_RE.exec(attrs)
    const fill = fillMatch ? fillMatch[1] : ""
    return `<path${attrs} data-trace-region="" data-fill="${fill}" ${slash}>`
  })

  return { html: svg }
}
