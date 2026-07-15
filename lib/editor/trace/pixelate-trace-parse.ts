/**
 * Parse an APPLIED pixelate trace SVG (from the Python filter service) into the
 * geometry the Konva overlay needs to render crisp, pixel-snapped cells + grid.
 *
 * The result SVG (`filter-service/app/pixelate.py`) looks like:
 *
 *   <svg ... viewBox="0 0 {cropped_w_px} {cropped_h_px}">
 *     <g id="colors" transform="scale(sx sy)">
 *       <rect x="cx" y="cy" width="1" height="1" fill="#rrggbb"/> ...   (cell-space)
 *     </g>
 *     <g id="grid">
 *       <line x1="X" y1="0" x2="X" y2="H" .../>   (vertical, viewBox px)
 *       <line x1="0" y1="Y" x2="W" y2="Y" .../>   (horizontal)
 *     </g>
 *     <g id="numbers"> ... </g>   (optional; NOT parsed — stays in the DOM overlay)
 *   </svg>
 *
 * We render cells + grid on the Konva canvas (crisp, zoom-stable) and leave the
 * numbers group in the DOM overlay on top. Only pixelate carries `<g id="grid">`;
 * linerate/circulate return `null` here so the Konva overlay stays inert for them.
 *
 * Regex-based on purpose (mirrors `prepare-trace-svg.ts`): the SVG comes from a
 * deterministic Python pipeline, and this must run in vitest without a DOM.
 */
export type ParsedPixelateTrace = {
  /** viewBox extent = the cropped source-pixel size. */
  viewBoxW: number
  viewBoxH: number
  cellsX: number
  cellsY: number
  /** Row-major (cy * cellsX + cx) packed 0xRRGGBB per cell. */
  cellRgb: Uint32Array
  /** Vertical grid-line x positions, in viewBox (crop-px) coordinates. */
  gridXs: number[]
  /** Horizontal grid-line y positions, in viewBox coordinates. */
  gridYs: number[]
}

const VIEWBOX_RE = /viewBox="0 0 ([\d.]+) ([\d.]+)"/
const GROUP_RE = (id: string) => new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)</g>`, "i")
const RECT_RE = /<rect\b[^>]*\bx="([\d.]+)"[^>]*\by="([\d.]+)"[^>]*\bfill="#([0-9a-fA-F]{6})"/g
const LINE_RE = /<line\b[^>]*\bx1="([\d.]+)"[^>]*\by1="([\d.]+)"[^>]*\bx2="([\d.]+)"[^>]*\by2="([\d.]+)"/g

/**
 * Parse the pixelate trace SVG. Returns `null` when it is not a pixelate grid
 * (no `<g id="grid">`), the viewBox is missing, or no cells were found — in all
 * those cases the caller renders nothing on Konva and leaves the SVG overlay be.
 */
export function parsePixelateTraceSvg(svgText: string | null | undefined): ParsedPixelateTrace | null {
  if (!svgText) return null

  const gridGroup = GROUP_RE("grid").exec(svgText)
  if (!gridGroup) return null // not a pixelate grid (linerate/circulate)

  const vb = VIEWBOX_RE.exec(svgText)
  if (!vb) return null
  const viewBoxW = Number(vb[1])
  const viewBoxH = Number(vb[2])
  if (!(viewBoxW > 0) || !(viewBoxH > 0)) return null

  // Cells from <g id="colors"> (cell-space rects: x=cx, y=cy).
  const colorsGroup = GROUP_RE("colors").exec(svgText)
  if (!colorsGroup) return null
  const rects: Array<{ cx: number; cy: number; rgb: number }> = []
  let cellsX = 0
  let cellsY = 0
  RECT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RECT_RE.exec(colorsGroup[1])) !== null) {
    const cx = Number(m[1])
    const cy = Number(m[2])
    const rgb = parseInt(m[3], 16)
    rects.push({ cx, cy, rgb })
    if (cx + 1 > cellsX) cellsX = cx + 1
    if (cy + 1 > cellsY) cellsY = cy + 1
  }
  if (cellsX <= 0 || cellsY <= 0 || rects.length === 0) return null

  const cellRgb = new Uint32Array(cellsX * cellsY)
  for (const r of rects) cellRgb[r.cy * cellsX + r.cx] = r.rgb

  // Grid lines: verticals (x1==x2) → x; horizontals (y1==y2) → y.
  const gridXs: number[] = []
  const gridYs: number[] = []
  LINE_RE.lastIndex = 0
  while ((m = LINE_RE.exec(gridGroup[1])) !== null) {
    const x1 = Number(m[1])
    const y1 = Number(m[2])
    const x2 = Number(m[3])
    const y2 = Number(m[4])
    if (x1 === x2) gridXs.push(x1)
    else if (y1 === y2) gridYs.push(y1)
  }

  return { viewBoxW, viewBoxH, cellsX, cellsY, cellRgb, gridXs, gridYs }
}
