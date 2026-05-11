/**
 * Pull the structural pieces out of a trace SVG so we can re-emit
 * the colored regions as an interactive DOM overlay.
 *
 * Numerate's output groups its colored paths under
 * `<g id="colors" transform="scale(...)"`>` (the scale stretches
 * the integer-pitch bitmap regions back to the original image
 * dimensions — see `vectorise.numerate_to_svg`). Lineart's output
 * groups under `<g id="regions">` with no scale transform. Both
 * variants are handled by the same parser.
 *
 * Regex-based on purpose — the parser runs in vitest without a DOM
 * environment, and our trace SVGs are emitted by a deterministic
 * Python pipeline (no nested quoting, no entity-encoded attrs).
 */
export type ParsedTracePath = {
  d: string
  fill: string
  /** Per-path transform attribute (vtracer often emits one). */
  transform: string | null
}

export type ParsedTraceSvg = {
  viewBox: string
  /** Width/height from the root `<svg>` tag, in image pixels. */
  width: number
  height: number
  /** Transform applied to the regions group (numerate's scale, if any). */
  groupTransform: string | null
  paths: ParsedTracePath[]
  /** Stroke width detected on any region or grid line — used as
   * the highlight stroke so it matches the trace's visual rhythm. */
  detectedStrokeWidth: number
}

const SVG_OPEN_RE = /<svg\b([^>]*)>/i
const GROUP_OPEN_RE = /<g\s+[^>]*id="(?:colors|regions)"([^>]*)>/i
const PATH_RE = /<path\b([^/>]*)\/?>/gi
const STROKE_WIDTH_RE = /\bstroke-width\s*=\s*"([^"]*)"/i
const NUMERIC_RE = /^-?\d+(?:\.\d+)?$/

function readAttr(blob: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i")
  const m = re.exec(blob)
  return m ? m[1] : null
}

function readNumber(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback
  const trimmed = raw.trim()
  if (!NUMERIC_RE.test(trimmed)) return fallback
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : fallback
}

export function parseTraceSvg(svgText: string): ParsedTraceSvg | null {
  const svgMatch = SVG_OPEN_RE.exec(svgText)
  if (!svgMatch) return null
  const svgAttrs = svgMatch[1]
  const viewBox = readAttr(svgAttrs, "viewBox") ?? ""
  const width = readNumber(readAttr(svgAttrs, "width"), 0)
  const height = readNumber(readAttr(svgAttrs, "height"), 0)

  const groupMatch = GROUP_OPEN_RE.exec(svgText)
  const groupTransform = groupMatch ? readAttr(groupMatch[1], "transform") : null

  // Limit the path search to the regions group's body so grid lines
  // (which are <line>, but the loop is path-scoped anyway) and any
  // future overlays outside the regions group don't leak in.
  let pathSource = svgText
  if (groupMatch) {
    const start = groupMatch.index + groupMatch[0].length
    const end = svgText.indexOf("</g>", start)
    if (end > start) pathSource = svgText.slice(start, end)
  }

  const paths: ParsedTracePath[] = []
  PATH_RE.lastIndex = 0
  let pm: RegExpExecArray | null
  while ((pm = PATH_RE.exec(pathSource)) !== null) {
    const attrs = pm[1]
    const d = readAttr(attrs, "d")
    if (!d) continue
    paths.push({
      d,
      fill: readAttr(attrs, "fill") ?? "",
      transform: readAttr(attrs, "transform"),
    })
  }

  // Detect stroke width from any element in the SVG (region path or
  // grid line). Falls back to 1 so the overlay always has a visible
  // highlight even if the trace SVG used unusual markup.
  let detectedStrokeWidth = 1
  const swMatch = STROKE_WIDTH_RE.exec(svgText)
  if (swMatch) {
    const sw = readNumber(swMatch[1], 1)
    if (sw > 0) detectedStrokeWidth = sw
  }

  return { viewBox, width, height, groupTransform, paths, detectedStrokeWidth }
}
