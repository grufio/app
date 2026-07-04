/**
 * Pure helpers for drawing the pixelate config-dialog preview on a `<canvas>` in
 * DEVICE resolution — crisp cells + a device-pixel-snapped 1px grid, replacing the
 * old stretched-SVG preview (`buildPixelateCellsSvg`) whose 1px `<line>` landed on
 * fractional device pixels and read as a soft ~2px grey line.
 *
 * These are the unit-tested core; the canvas wiring (getContext, drawImage,
 * fillRect) lives in the pane and is verified visually (jsdom has no real canvas).
 */
import type { CellColors } from "./pixelate-preview"

/**
 * Pack per-cell RGB into an RGBA byte buffer for a tiny `cellsX×cellsY` offscreen
 * canvas (one pixel per cell, row-major `cy*cellsX + cx`, fully opaque). The pane
 * then `drawImage`s it onto the display canvas with `imageSmoothingEnabled=false`
 * (nearest-neighbour) → crisp blocks at any zoom.
 */
export function buildPixelatePreviewImageData(
  cells: CellColors,
  cellsX: number,
  cellsY: number,
): Uint8ClampedArray {
  const { r, g, b } = cells
  const n = cellsX * cellsY
  const data = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i += 1) {
    data[i * 4] = r[i]
    data[i * 4 + 1] = g[i]
    data[i * 4 + 2] = b[i]
    data[i * 4 + 3] = 255
  }
  return data
}

/**
 * Cell-boundary positions (0..cells, inclusive) rounded to whole DEVICE pixels, so
 * each grid line can be drawn as a crisp 1-device-pixel `fillRect`. The last line
 * is clamped to `dim-1` so its 1px column/row stays inside the canvas.
 */
export function pixelatePreviewGridDevicePx(
  cellsX: number,
  cellsY: number,
  wDev: number,
  hDev: number,
): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  for (let i = 0; i <= cellsX; i += 1) xs.push(Math.min(wDev - 1, Math.round((i / cellsX) * wDev)))
  const ys: number[] = []
  for (let j = 0; j <= cellsY; j += 1) ys.push(Math.min(hDev - 1, Math.round((j / cellsY) * hDev)))
  return { xs, ys }
}
