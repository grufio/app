/**
 * Pre-snap k-medoid palette restriction (PR-I) — client mirror of
 * `filter-service/app/palette_reduction.py::restrict_palette_pam`.
 *
 * When the user picks `palette_restriction = "pam"`, the preview
 * + Apply paths both restrict the active palette to `num_colors`
 * medoid chips BEFORE the snap step (or the dither algorithm). The
 * snap then runs against the restricted palette and the post-snap
 * count-based reduction is skipped.
 *
 * Algorithm:
 *   1. Histogram the cell means into unique RGB triples + counts
 *      (uint32-packed key for O(N) grouping).
 *   2. Convert cells + palette to the active distance space (OKLab
 *      squared-Euclidean by default; CIE Lab D65 + ΔE00 when
 *      `distanceMetric === "ciede2000"` per PR-H).
 *   3. Build the (N_unique × M) distance matrix.
 *   4. Run `pamSelectMedoids` (PR-C) with `counts` as weights → `k`
 *      sorted medoid indices into the full palette.
 *   5. Return the restricted palette views + the `kept` translation
 *      array (caller uses it to map post-snap indices back to ORIGINAL
 *      palette positions for the `palette_indices_used` wire contract).
 *
 * Short-circuits to the full palette when `numColors` ≤ 0 or ≥ palette
 * size — `kept` is then `[0..M-1]` so callers can treat both branches
 * interchangeably.
 *
 * Mirror of the Python module's signature and short-circuit behaviour
 * so preview ↔ apply byte-equivalence holds for the same inputs.
 */
import { ciede2000, rgb255ToCielab, type CieLab } from "@/lib/color/ciede2000"
import { rgb255ToOklab, type Oklab } from "@/lib/color/oklab"

import type { DistanceMetric } from "./distance-metric-schema"
import { distanceMatrixFromRows, pamSelectMedoids } from "./pam-palette"
import type { PaletteChip } from "./trace-cell-colors"

/**
 * Cell-mean histogram cap. Keeps the worst-case PAM input size linear
 * in distinct cell colours rather than total cell count. Real images
 * typically have ≤ ~10k unique uint8 RGB triples even at high res.
 */
const _HISTOGRAM_CAP_HINT = 1 << 24 // 16M (8 bits × 3 channels)
void _HISTOGRAM_CAP_HINT

/** Pack `(r, g, b)` uint8 → uint32 key for histogram grouping. Mirror
 * of `palette-reduction.ts::packRgb`. */
function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b
}

export type RestrictedPalette = {
  /** Restricted palette view, ordered by ascending original palette index. */
  palette: PaletteChip[]
  /** `kept[i]` = index of the `i`-th restricted chip in the ORIGINAL palette.
   * Use {@link translateRestrictedIndices} to map post-snap indices back. */
  kept: number[]
}

/**
 * Restrict the active palette to `numColors` medoid chips via weighted
 * PAM clustering on the cell-mean histogram. See module docstring for
 * the algorithm.
 *
 * Returns the FULL palette + identity `kept` when no restriction is
 * needed (`numColors` ≤ 0 or ≥ palette length).
 */
export function restrictPalettePam(args: {
  cells: { r: Uint8ClampedArray; g: Uint8ClampedArray; b: Uint8ClampedArray }
  palette: ReadonlyArray<PaletteChip>
  numColors: number | null | undefined
  distanceMetric?: DistanceMetric
}): RestrictedPalette {
  const { cells, palette, numColors, distanceMetric = "oklab" } = args
  const M = palette.length
  if (numColors == null || numColors <= 0 || numColors >= M) {
    return { palette: palette.slice(), kept: Array.from({ length: M }, (_, i) => i) }
  }

  // 1. Histogram cell means → unique RGB triples + counts.
  const seenKey = new Map<number, number>() // packedRgb → unique-index
  const uniqueR: number[] = []
  const uniqueG: number[] = []
  const uniqueB: number[] = []
  const counts: number[] = []
  const N = cells.r.length
  for (let i = 0; i < N; i += 1) {
    const r = cells.r[i]
    const g = cells.g[i]
    const b = cells.b[i]
    const key = packRgb(r, g, b)
    const existing = seenKey.get(key)
    if (existing === undefined) {
      seenKey.set(key, uniqueR.length)
      uniqueR.push(r)
      uniqueG.push(g)
      uniqueB.push(b)
      counts.push(1)
    } else {
      counts[existing] += 1
    }
  }

  // 2. Convert cells + palette to active distance space.
  const nUnique = uniqueR.length
  const cellsLab: Array<Oklab | CieLab> = new Array(nUnique)
  const paletteLab: Array<Oklab | CieLab> = new Array(M)
  if (distanceMetric === "ciede2000") {
    for (let i = 0; i < nUnique; i += 1) {
      cellsLab[i] = rgb255ToCielab(uniqueR[i], uniqueG[i], uniqueB[i])
    }
    for (let j = 0; j < M; j += 1) {
      const rgb = palette[j].rgb
      paletteLab[j] = rgb255ToCielab(rgb[0], rgb[1], rgb[2])
    }
  } else {
    for (let i = 0; i < nUnique; i += 1) {
      cellsLab[i] = rgb255ToOklab(uniqueR[i], uniqueG[i], uniqueB[i])
    }
    for (let j = 0; j < M; j += 1) {
      // Reuse the cached OKLab from the palette chip — same as the server
      // reads from the DB columns.
      paletteLab[j] = palette[j].oklab
    }
  }

  // 3. Build (N_unique × M) distance matrix in the active metric.
  const rows: number[][] = new Array(nUnique)
  for (let i = 0; i < nUnique; i += 1) {
    const row = new Array<number>(M)
    const c = cellsLab[i]
    for (let j = 0; j < M; j += 1) {
      const p = paletteLab[j]
      if (distanceMetric === "ciede2000") {
        row[j] = ciede2000(c as CieLab, p as CieLab)
      } else {
        // OKLab squared-Euclidean — same metric as the legacy snap.
        const dl = c[0] - p[0]
        const da = c[1] - p[1]
        const db = c[2] - p[2]
        row[j] = dl * dl + da * da + db * db
      }
    }
    rows[i] = row
  }
  const D = distanceMatrixFromRows(rows)

  // 4. Weighted PAM → k sorted medoid indices.
  const medoids = pamSelectMedoids(D, numColors, { weights: counts })

  // 5. Build the restricted palette view + kept-index translation.
  const restricted: PaletteChip[] = medoids.map((m) => palette[m])
  return { palette: restricted, kept: medoids.slice() }
}

/**
 * Translate restricted-palette indices (0..k-1) back to indices in the
 * ORIGINAL palette via {@link RestrictedPalette.kept}.
 *
 * Paint-by-numbers labels and the editor's Colors sheet match on the
 * original palette index — emitting restricted-array positions would
 * produce wrong chip names. Top-N branch implicitly preserves original
 * indices (its kept set is already in original space); the PAM branch
 * needs this explicit translation.
 */
export function translateRestrictedIndices(
  indicesInRestricted: ArrayLike<number>,
  kept: ReadonlyArray<number>,
): number[] {
  const out = new Array<number>(indicesInRestricted.length)
  for (let i = 0; i < indicesInRestricted.length; i += 1) {
    out[i] = kept[indicesInRestricted[i]]
  }
  return out
}
