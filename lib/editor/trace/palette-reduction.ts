/**
 * Top-N palette-chip cap shared between pixelate + circulate preview.
 *
 * After the snap (and any optional texture step) the per-cell grid may use
 * more distinct palette chips than the user-requested `num_colors` cap.
 * `reduceToTopN` keeps the most-used chips and re-snaps the remaining cells
 * to the nearest chip in the kept set.
 *
 * Mirror of `filter-service/app/palette_reduction.py::reduce_to_top_n` —
 * without this port the preview shows more distinct chips than the Python
 * apply ever emits, so the user can't tune `num_colors` visually. Parity-
 * tested via `palette-reduction.test.ts`.
 */
import { nearestPaletteIndex, rgb255ToOklab } from "@/lib/color/oklab"

import type { CellColors, PaletteChip } from "./trace-cell-colors"

/**
 * Pack a (r,g,b) triple into a uint32 key. The 8 high bits are unused so
 * the result fits in a JS number (signed 32-bit range is fine).
 */
function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b
}

/**
 * Build the cell → palette-index lookup via exact RGB match. Mirrors the
 * server's `reconstruct_palette_indices`. Throws if any cell colour isn't
 * a palette chip — shouldn't happen for a post-snap input.
 */
function reconstructPaletteIndices(
  cells: CellColors,
  palette: ReadonlyArray<PaletteChip>,
): Int32Array {
  const keyToIdx = new Map<number, number>()
  for (let i = 0; i < palette.length; i += 1) {
    const [r, g, b] = palette[i].rgb
    keyToIdx.set(packRgb(r, g, b), i)
  }
  const n = cells.r.length
  const out = new Int32Array(n)
  for (let i = 0; i < n; i += 1) {
    const key = packRgb(cells.r[i], cells.g[i], cells.b[i])
    const idx = keyToIdx.get(key)
    if (idx === undefined) {
      throw new Error(`reconstructPaletteIndices: cell colour not in palette at index ${i}`)
    }
    out[i] = idx
  }
  return out
}

/**
 * Cap distinct palette chips in `cells` to at most `numColors`. Cells must
 * be post-snap (every cell colour is exactly one palette chip).
 *
 * - `numColors <= 0` or `numColors >= distinct-snap-winners`: no-op, returns
 *   the input unchanged (with `didReduce: false`).
 * - Otherwise: histogram the snap winners, keep the top-N most-used, re-snap
 *   any cell whose index isn't in the kept set to the nearest chip IN that
 *   set (OKLab nearest, same metric as the initial snap).
 */
export function reduceToTopN(
  cells: CellColors,
  palette: ReadonlyArray<PaletteChip>,
  numColors: number | null | undefined,
): { cells: CellColors; didReduce: boolean } {
  if (numColors == null || numColors <= 0 || palette.length === 0) {
    return { cells, didReduce: false }
  }
  const preIndices = reconstructPaletteIndices(cells, palette)
  const counts = new Map<number, number>()
  for (let i = 0; i < preIndices.length; i += 1) {
    const idx = preIndices[i]
    counts.set(idx, (counts.get(idx) ?? 0) + 1)
  }
  if (counts.size <= numColors) {
    return { cells, didReduce: false }
  }
  // Take the top-N palette indices by occurrence, descending. Tie-break by
  // smaller index for determinism (palette_index order = selection rank).
  const ranked = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return a[0] - b[0]
  })
  const keptIdx = new Set<number>()
  for (let i = 0; i < numColors; i += 1) keptIdx.add(ranked[i][0])
  // Build the kept-set OKLab array for re-snapping excluded cells.
  const keptList = Array.from(keptIdx)
  const keptOklab = keptList.map((idx) => palette[idx].oklab)

  const n = cells.r.length
  const r = new Uint8ClampedArray(n)
  const g = new Uint8ClampedArray(n)
  const b = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i += 1) {
    const preIdx = preIndices[i]
    if (keptIdx.has(preIdx)) {
      r[i] = cells.r[i]
      g[i] = cells.g[i]
      b[i] = cells.b[i]
      continue
    }
    const localIdx = nearestPaletteIndex(
      rgb255ToOklab(cells.r[i], cells.g[i], cells.b[i]),
      keptOklab,
    )
    const chip = palette[keptList[localIdx]].rgb
    r[i] = chip[0]
    g[i] = chip[1]
    b[i] = chip[2]
  }
  return { cells: { r, g, b }, didReduce: true }
}
