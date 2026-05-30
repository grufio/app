/**
 * Per-cell number labels for client trace previews.
 *
 * Mirrors the server's `filter-service/app/cell_labels.py`:
 * - Reconstruct palette indices from the FINAL cell colours (post-snap,
 *   post-texture) by exact-match reverse-lookup against the palette.
 * - Sorted unique indices → labels starting at 1.
 *
 * Used by the Pixelate / Circulate dialog previews to paint the same
 * paint-by-numbers labels users see in the editor canvas, before they
 * hit Apply. Labels in the dialog are always rendered (no toggle pre-
 * apply) — the editor's `numbersLayerVisible` toggle only applies once
 * the trace is applied and rendered through `TraceInlineSvg`.
 */
import type { PaletteChip } from "./trace-cell-colors"

export type CellRgb = {
  r: Uint8ClampedArray | Uint8Array
  g: Uint8ClampedArray | Uint8Array
  b: Uint8ClampedArray | Uint8Array
}

function packRgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
}

/**
 * Map the (already-snapped) cells back to palette indices + build the
 * sorted-unique → label-from-1 mapping. Returns null when no palette is
 * available (callers degrade to no labels — same contract as the server,
 * which omits the `<g id="numbers">` group entirely).
 */
export function computeCellLabels(args: {
  cells: CellRgb
  cellsX: number
  cellsY: number
  palette: ReadonlyArray<PaletteChip>
}): { labels: Uint16Array; labelByIndex: Map<number, number> } | null {
  const { cells, cellsX, cellsY, palette } = args
  if (palette.length === 0) return null

  const total = cellsX * cellsY
  const paletteKeys = new Map<number, number>() // packed-rgb → palette idx
  for (let i = 0; i < palette.length; i += 1) {
    const [pr, pg, pb] = palette[i].rgb
    paletteKeys.set(packRgb(pr, pg, pb), i)
  }

  const indices = new Int32Array(total)
  for (let i = 0; i < total; i += 1) {
    const idx = paletteKeys.get(packRgb(cells.r[i], cells.g[i], cells.b[i]))
    // Defensive: if a cell colour somehow isn't a palette chip (shouldn't
    // happen post-snap), drop labels for the whole preview rather than
    // emit a wrong number.
    if (idx === undefined) return null
    indices[i] = idx
  }

  const used = new Set<number>()
  for (let i = 0; i < total; i += 1) used.add(indices[i])
  const sortedUnique = Array.from(used).sort((a, b) => a - b)
  const labelByIndex = new Map<number, number>()
  sortedUnique.forEach((idx, pos) => labelByIndex.set(idx, pos + 1))

  const labels = new Uint16Array(total)
  for (let i = 0; i < total; i += 1) labels[i] = labelByIndex.get(indices[i]) ?? 0
  return { labels, labelByIndex }
}

/**
 * Paint labels at cell centres onto a canvas. Mirrors the SVG emission:
 * sans-serif, white halo via `strokeText` then `fillText` black, centred,
 * font sized to ~40% of the smaller cell dimension. `pxPerCellX/Y` are in
 * canvas pixels — caller computes `target.width / cellsX` etc.
 */
export function paintCellLabels(args: {
  ctx: CanvasRenderingContext2D
  labels: Uint16Array
  cellsX: number
  cellsY: number
  pxPerCellX: number
  pxPerCellY: number
}): void {
  const { ctx, labels, cellsX, cellsY, pxPerCellX, pxPerCellY } = args
  const fontSize = Math.min(pxPerCellX, pxPerCellY) * 0.4
  if (fontSize < 1) return // illegible at sub-pixel sizes; skip work
  ctx.save()
  ctx.font = `${fontSize.toFixed(2)}px sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.lineWidth = fontSize * 0.24 // matches SVG stroke ratio (2 × 0.12)
  ctx.strokeStyle = "white"
  ctx.fillStyle = "black"
  for (let cy = 0; cy < cellsY; cy += 1) {
    const yp = (cy + 0.5) * pxPerCellY
    for (let cx = 0; cx < cellsX; cx += 1) {
      const text = String(labels[cy * cellsX + cx])
      const xp = (cx + 0.5) * pxPerCellX
      ctx.strokeText(text, xp, yp)
      ctx.fillText(text, xp, yp)
    }
  }
  ctx.restore()
}
