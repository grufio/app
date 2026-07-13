/**
 * Client port of the server's coverage-based paint selection
 * (`filter-service/app/palette_reduction.py::reduce_to_top_n`, the default
 * `top_n` path in `_select_paints`). Replaces the preview's K-means: snap every
 * pixel to the nearest palette chip, keep the `num_colors` most-used chips, and
 * re-snap the rest to the nearest kept chip. Produces a per-pixel paint map
 * (full-palette chip index) ready for `connectedComponents` / `segmentRegions`.
 *
 * K-means minimised within-cluster variance and picked a different chip set than
 * the server's frequency coverage — mirroring the server's selection is part of
 * the preview-parity work.
 */
import { nearestPaletteIndex, rgb255ToOklab } from "@/lib/color/oklab"

import type { PaletteChip } from "./trace-cell-colors"

/**
 * Per-pixel paint map over the ≤`num_colors` most-used palette chips. Returns
 * an Int32Array of full-palette chip indices (row-major). Empty palette → all
 * zeros. Mirrors the server: every pixel ends up snapped to the nearest chip in
 * the selected set (kept pixels keep their global-nearest chip; excluded pixels
 * re-snap to the nearest kept chip).
 */
export function coverageSelectPaintMap(
  image: { width: number; height: number; rgba: Uint8ClampedArray },
  palette: ReadonlyArray<PaletteChip>,
  numColors: number,
): Int32Array {
  const { width, height, rgba } = image
  const n = width * height
  const paint = new Int32Array(n)
  if (palette.length === 0) return paint

  const paletteOklab = palette.map((c) => c.oklab)

  // 1. Snap every pixel to its nearest full-palette chip + count frequencies.
  const pre = new Int32Array(n)
  const counts = new Map<number, number>()
  for (let i = 0; i < n; i += 1) {
    const o = i * 4
    const idx = nearestPaletteIndex(rgb255ToOklab(rgba[o], rgba[o + 1], rgba[o + 2]), paletteOklab)
    pre[i] = idx
    counts.set(idx, (counts.get(idx) ?? 0) + 1)
  }

  const K = Math.max(2, numColors) // server: K = max(2, num_colors)
  if (counts.size <= K) return pre

  // 2. Keep the top-K chips by frequency (ties → first seen, like numpy argsort).
  const kept = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, K).map((e) => e[0])
  const keptSet = new Set(kept)
  const keptOklab = kept.map((idx) => paletteOklab[idx])

  // 3. Excluded pixels re-snap to the nearest kept chip; kept pixels stay.
  for (let i = 0; i < n; i += 1) {
    if (keptSet.has(pre[i])) {
      paint[i] = pre[i]
      continue
    }
    const o = i * 4
    const local = nearestPaletteIndex(rgb255ToOklab(rgba[o], rgba[o + 1], rgba[o + 2]), keptOklab)
    paint[i] = kept[local]
  }
  return paint
}
