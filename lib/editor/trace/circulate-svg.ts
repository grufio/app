/**
 * Client-side SVG builder for the Circulate preview — the vector counterpart to
 * the rasterized `paintCirculateCells` (`circulate-preview.ts`).
 *
 * Circles are curves: drawn as `<canvas>` raster they upscale blocky/soft; as
 * SVG `<ellipse>` they stay crisp at any zoom (the viewBox scales stufenlos).
 * This emits the SAME per-cell geometry the canvas painter uses, so the preview
 * looks identical — just vector instead of raster.
 *
 * Geometry mirrors `paintCirculateCells`:
 * - viewBox = `cellsX × cellsY` (one unit per cell), so the SVG stretches to
 *   whatever the pane sizes it to (matching the canvas' non-uniform cellW/cellH).
 * - ellipse centre = (cx+0.5, cy+0.5); radii = fraction / 2 (in cell units).
 * - frame outline uses `vector-effect="non-scaling-stroke"` so it stays a
 *   constant 1px hairline regardless of the viewBox scale.
 *
 * Structure matches the server (`filter-service/app/circulate.py`): `<g id="cells">`
 * then `<g id="frames">`. The preview carries no numbers group.
 */
import type { CirculateEllipseFractions } from "./circulate-preview"
import type { CellColors } from "./pixelate-preview"

function hex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Trim floats to 4 dp like the server, keeping the string small. */
function n(v: number): string {
  return Number(v.toFixed(4)).toString()
}

export function buildCirculateSvg(args: {
  cellsX: number
  cellsY: number
  outer: CellColors
  inner: CellColors | null
  ellipseFractions: CirculateEllipseFractions
}): string {
  const { cellsX, cellsY, outer, inner, ellipseFractions } = args
  const outerRx = ellipseFractions.outerWFrac / 2
  const outerRy = ellipseFractions.outerHFrac / 2
  const innerRx = ellipseFractions.innerWFrac / 2
  const innerRy = ellipseFractions.innerHFrac / 2
  const hasInner = inner != null && innerRx > 0 && innerRy > 0

  const cells: string[] = []
  const frames: string[] = []
  for (let cy = 0; cy < cellsY; cy += 1) {
    const centerY = cy + 0.5
    for (let cx = 0; cx < cellsX; cx += 1) {
      const i = cy * cellsX + cx
      const centerX = cx + 0.5
      if (outerRx > 0 && outerRy > 0) {
        cells.push(
          `<ellipse cx="${n(centerX)}" cy="${n(centerY)}" rx="${n(outerRx)}" ry="${n(outerRy)}" fill="${hex(outer.r[i], outer.g[i], outer.b[i])}"/>`,
        )
      }
      if (hasInner) {
        cells.push(
          `<ellipse cx="${n(centerX)}" cy="${n(centerY)}" rx="${n(innerRx)}" ry="${n(innerRy)}" fill="${hex(inner!.r[i], inner!.g[i], inner!.b[i])}"/>`,
        )
      }
      if (outerRx > 0 && outerRy > 0) {
        frames.push(
          `<ellipse cx="${n(centerX)}" cy="${n(centerY)}" rx="${n(outerRx)}" ry="${n(outerRy)}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1" vector-effect="non-scaling-stroke"/>`,
        )
      }
    }
  }

  // White background: circles read as a clean paint-by-numbers on paper, not
  // muddy dots over a photo/dark canvas. (Verified: white + a gap + thin frame
  // is what makes the mosaic look good.)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${cellsX} ${cellsY}" preserveAspectRatio="none">` +
    `<rect x="0" y="0" width="${cellsX}" height="${cellsY}" fill="#ffffff"/>` +
    `<g id="cells">${cells.join("")}</g>` +
    `<g id="frames">${frames.join("")}</g>` +
    `</svg>`
  )
}
