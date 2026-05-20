/**
 * Wraps the Python-emitted pixelate SVG in a master-image-sized
 * outer SVG with a `translate(offsetX, offsetY)` group, so the trace
 * row's bitmap dimensions match the master image (no Konva stretch).
 *
 * Python emits the SVG at the cropped dimensions (see
 * filter-service/app/pixelate.py:152-163):
 *
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <svg xmlns="…" width="cropped_w_px" height="cropped_h_px"
 *        viewBox="0 0 cropped_w_px cropped_h_px">
 *     <g id="colors" transform="scale(…)">…</g>
 *     <g id="grid">…</g>
 *   </svg>
 *
 * This helper preserves the inner body verbatim and only swaps the
 * outer envelope. If Python ever changes its outer-SVG shape (extra
 * attributes, different whitespace), the unit test in
 * pixelate-svg-pad.test.ts breaks — that's intentional: forces a
 * synchronised update rather than silent drift.
 */
export function padSvgToFullImage(args: {
  pythonSvg: string
  origWidth: number
  origHeight: number
  offsetX: number
  offsetY: number
}): string {
  const { pythonSvg, origWidth, origHeight, offsetX, offsetY } = args

  const openIdx = pythonSvg.indexOf("<svg")
  const openEndIdx = openIdx === -1 ? -1 : pythonSvg.indexOf(">", openIdx)
  const closeIdx = pythonSvg.lastIndexOf("</svg>")

  if (openIdx === -1 || openEndIdx === -1 || closeIdx === -1 || openEndIdx > closeIdx) {
    throw new Error("padSvgToFullImage: input does not look like a Python pixelate SVG (missing <svg>…</svg> envelope)")
  }

  const innerBody = pythonSvg.slice(openEndIdx + 1, closeIdx)

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${origWidth}" height="${origHeight}" viewBox="0 0 ${origWidth} ${origHeight}">\n` +
    `  <g transform="translate(${offsetX} ${offsetY})">${innerBody}</g>\n` +
    `</svg>`
  )
}
