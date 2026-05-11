/**
 * Prepare a vtracer-emitted SVG for inline rendering in the canvas:
 *
 * - Strip the `<?xml ... ?>` declaration so the markup is valid
 *   inside an HTML host document.
 * - Drop the root `<svg>`'s `width=/height=` attributes and replace
 *   with `width="100%" height="100%" preserveAspectRatio="none"` so
 *   the SVG fills its (already pixel-sized) wrapper div instead of
 *   rendering at its intrinsic image-pixel dimensions.
 * - Annotate every `<path>` with `data-trace-region=""` and
 *   `data-fill="<original fill>"` so CSS attribute selectors can
 *   highlight the clicked region + every other region sharing the
 *   same fill color (paint-by-numbers grouping).
 * - Surface the stroke width detected in the SVG (lineart paths
 *   carry one; numerate's grid lines do) so the caller can use it
 *   for the hover/select highlight stroke.
 *
 * Regex-based for the same reasons as the legacy parser — runs in
 * vitest without jsdom, and our trace SVGs come from a deterministic
 * Python pipeline.
 */
export type PreparedTraceSvg = {
  /** Markup ready to inject via `dangerouslySetInnerHTML`. */
  html: string
  /** Highlight stroke width to use for hover + select states. */
  strokeWidth: number
}

const XML_DECL_RE = /<\?xml[^>]*\?>/
const SVG_OPEN_RE = /<svg\b([^>]*)>/i
const PATH_OPEN_RE = /<path\b([^/>]*?)\s*(\/?)>/gi
const FILL_ATTR_RE = /\bfill\s*=\s*"([^"]*)"/i
const STROKE_WIDTH_RE = /\bstroke-width\s*=\s*"([^"]+)"/i
const WIDTH_ATTR_RE = /\bwidth\s*=\s*"[^"]*"/i
const HEIGHT_ATTR_RE = /\bheight\s*=\s*"[^"]*"/i
const NUMERIC_RE = /^-?\d+(?:\.\d+)?$/

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

  // Detect stroke width from anywhere in the SVG (region path or
  // grid line). Falls back to 1.
  let strokeWidth = 1
  const swMatch = STROKE_WIDTH_RE.exec(svg)
  if (swMatch) {
    const trimmed = swMatch[1].trim()
    if (NUMERIC_RE.test(trimmed)) {
      const n = Number(trimmed)
      if (n > 0 && Number.isFinite(n)) strokeWidth = n
    }
  }

  // Annotate every <path> with data-trace-region + data-fill.
  // vtracer's region paths are the only <path> elements in our
  // numerate/lineart SVGs (grid uses <line>, background uses
  // <rect>), so a blanket annotation is correct.
  svg = svg.replace(PATH_OPEN_RE, (_full, attrs: string, slash: string) => {
    const fillMatch = FILL_ATTR_RE.exec(attrs)
    const fill = fillMatch ? fillMatch[1] : ""
    return `<path${attrs} data-trace-region="" data-fill="${fill}" ${slash}>`
  })

  return { html: svg, strokeWidth }
}
