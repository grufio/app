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
 * - Annotate every `<path>` with `data-trace-region=""` and
 *   `data-fill="<original fill>"` so the overlay can click-
 *   highlight the region + every other region sharing the same
 *   fill color (paint-by-numbers grouping). The original fill stays
 *   intact — cells render with their detected RGB color at rest.
 * The trace cells + their outlines render on the Konva canvas (crisp, zoom-stable),
 * so they are STRIPPED here and the DOM overlay keeps only the `<g id="numbers">`
 * labels (drawn on top):
 * - PIXELATE (has `<g id="grid">`): strip `<g id="colors">` + `<g id="grid">`
 *   (see `pixelate-trace-overlay.tsx`).
 * - CIRCULATE (has `<g id="frames">`): strip `<g id="cells">` + `<g id="frames">`
 *   (see `circulate-trace-overlay.tsx`). The `<g id="cells">` group nests
 *   `<g data-cell>` wrappers, so it's removed by a range strip up to the numbers
 *   group / `</svg>` rather than a `</g>`-matching regex.
 * Linerate has neither, so nothing is stripped and it renders fully here.
 *
 * The opaque white background `<rect>` is no longer present in the
 * Python output (see `filter-service/app/vectorise.py`). The trace
 * is a true overlay layer in the editor; the future toggle that
 * hides the entire trace reveals the filter chain tip underneath.
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
const PATH_OPEN_RE = /<path\b([^/>]*?)\s*(\/?)>/gi
const FILL_ATTR_RE = /\bfill\s*=\s*"([^"]*)"/i
const WIDTH_ATTR_RE = /\bwidth\s*=\s*"[^"]*"/i
const HEIGHT_ATTR_RE = /\bheight\s*=\s*"[^"]*"/i
const COLORS_GROUP_RE = /<g id="colors"[^>]*>[\s\S]*?<\/g>/i
const GRID_GROUP_RE = /<g id="grid"[^>]*>[\s\S]*?<\/g>/i
const FRAMES_GROUP_RE = /<g id="frames"[^>]*>/i
// Circulate `<g id="cells">` nests `<g data-cell>`, so a `</g>`-matching regex would
// stop early. Strip the whole cells+frames range up to the numbers group (or `</svg>`).
const CIRCULATE_STRIP_RE = /<g id="cells"[^>]*>[\s\S]*?(?=<g id="numbers"|<\/svg>)/i

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

  // Pixelate/circulate: drop the cells + their outlines — they render on the Konva
  // canvas (crisp, zoom-stable). Keep the numbers group. Linerate has neither, so both
  // branches are a no-op for it and it renders fully.
  if (GRID_GROUP_RE.test(svg)) {
    svg = svg.replace(COLORS_GROUP_RE, "").replace(GRID_GROUP_RE, "")
  } else if (FRAMES_GROUP_RE.test(svg)) {
    svg = svg.replace(CIRCULATE_STRIP_RE, "")
  }

  // Annotate every <path>; keep its original fill so the cell still
  // shows the detected RGB color at rest.
  svg = svg.replace(PATH_OPEN_RE, (_full, attrs: string, slash: string) => {
    const fillMatch = FILL_ATTR_RE.exec(attrs)
    const fill = fillMatch ? fillMatch[1] : ""
    return `<path${attrs} data-trace-region="" data-fill="${fill}" ${slash}>`
  })

  return { html: svg }
}
