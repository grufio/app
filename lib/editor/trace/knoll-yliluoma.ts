/**
 * Knoll-Yliluoma "arbitrary-palette positional dithering algorithm" —
 * client mirror of `filter-service/app/knoll_yliluoma.py`.
 *
 * The algorithm replaces single-chip snapping with N-candidate sub-
 * sampling: each cell selects N palette chips whose RUNNING MEAN
 * approximates the cell's target colour, then a positional threshold
 * (blue-noise LUT) picks one of those N chips per cell. Adjacent cells
 * hitting different threshold bins emit different chips, so a uniform
 * target region renders as a pleasing N-chip mix — the spatial-
 * quantization property that classical "single-snap" misses (and
 * that Ulichney neighbour-invasion can't deliver on monochrome input,
 * because its decision depends on neighbour colours that don't yet
 * differ).
 *
 * Reference: Joel Yliluoma (2014), "Joel Yliluoma's arbitrary-palette
 * positional dithering algorithm" — the candidate-selection scheme is
 * Knoll's; the explicit positional sort + threshold mapping is
 * Yliluoma's contribution.
 *
 * Two pure pieces in this module:
 *   - `knollYliluomaCandidates` — given target + palette + N, returns
 *     the N candidate chip indices (with multiplicity, since the same
 *     chip may be picked twice when the target is close to it).
 *   - `thresholdBin` — given (x, y) + LUT + N, returns the candidate
 *     rank ∈ [0, N) to emit at that position.
 *
 * The full pipeline composition (loop over cells, sort candidates by
 * lightness, look up threshold bin, emit chip RGB) lives in PR-F so
 * the algorithm itself stays small + parity-testable in isolation.
 *
 * Distance metric: squared-Euclidean over the provided palette space.
 * Callers choose the space (OKLab from `lib/color/oklab.ts`, CIE Lab
 * from `lib/color/ciede2000.ts`, or any other linear-ish space) — the
 * candidate-mean target colour is computed in that same space, so
 * averaging works as long as the space is approximately linear in
 * perceptual mixing.
 */

/**
 * A 256×256 blue-noise LUT, flattened row-major (`lut[y * 256 + x]`).
 * Same binary layout the server uses (`blue_noise_256.bin`); the
 * `cell-texture.ts` loader serves it as a `Uint8Array` of length 65536.
 */
export type BlueNoiseLut = Uint8Array
export const BLUE_NOISE_LUT_SIZE = 256

/**
 * Pick `patternSize` palette indices whose running mean approximates
 * `target`.
 *
 * Algorithm (Yliluoma 2014, §2):
 *   At step `i` (1-indexed), the running mean after picking `c_i`
 *   will be `(sum_prev + palette[c_i]) / i`. We want that mean to
 *   approximate `target`, so we pick
 *         `c_i = argmin_j ‖palette[j] - (target·i - sum_prev)‖²`.
 *   The first pick (i=1) collapses to plain nearest-neighbour. Each
 *   subsequent pick corrects the residual error from the running
 *   mean — so the running mean asymptotically tracks `target` even
 *   when no single palette chip is close.
 *
 * @param target       target colour in the palette's space, length D
 * @param palette      (M × D) palette laid out row-major: `palette[i*D + d]`
 * @param paletteSize  number of palette chips (= M)
 * @param dim          feature dimension (= D, typically 3)
 * @param patternSize  N ≥ 1; number of candidates to pick. N=1 ≡ plain snap.
 * @returns            (N,) candidate indices (may repeat)
 */
export function knollYliluomaCandidates(
  target: ReadonlyArray<number>,
  palette: ReadonlyArray<number>,
  paletteSize: number,
  dim: number,
  patternSize: number,
): number[] {
  if (patternSize < 1) {
    throw new Error(`patternSize must be ≥ 1; got ${patternSize}`)
  }
  if (target.length !== dim) {
    throw new Error(`target length ${target.length} doesn't match dim ${dim}`)
  }
  if (palette.length !== paletteSize * dim) {
    throw new Error(
      `palette length ${palette.length} doesn't match paletteSize×dim = ${paletteSize * dim}`,
    )
  }

  const candidates: number[] = new Array(patternSize)
  const cumulative = new Float64Array(dim) // zeros
  const residual = new Float64Array(dim)

  for (let i = 1; i <= patternSize; i += 1) {
    for (let d = 0; d < dim; d += 1) {
      residual[d] = target[d] * i - cumulative[d]
    }
    let bestJ = 0
    let bestD = Infinity
    for (let j = 0; j < paletteSize; j += 1) {
      const base = j * dim
      let s = 0
      for (let d = 0; d < dim; d += 1) {
        const diff = palette[base + d] - residual[d]
        s += diff * diff
      }
      if (s < bestD) {
        bestD = s
        bestJ = j
      }
    }
    candidates[i - 1] = bestJ
    const baseChosen = bestJ * dim
    for (let d = 0; d < dim; d += 1) {
      cumulative[d] += palette[baseChosen + d]
    }
  }
  return candidates
}

/**
 * Position → candidate rank ∈ `[0, patternSize)`.
 *
 * The 256×256 blue-noise LUT distributes values 0..255 organically
 * (no banding, no clusters per Ulichney 1993 void-and-cluster).
 * Mapping into N equal-width bins gives a sequence of N-tone
 * thresholds that look pleasant on uniform fields.
 *
 * Tile via `% 256` so positions outside the LUT wrap deterministically.
 */
export function thresholdBin(
  x: number,
  y: number,
  patternSize: number,
  lut: BlueNoiseLut,
): number {
  if (patternSize < 1) {
    throw new Error(`patternSize must be ≥ 1; got ${patternSize}`)
  }
  if (lut.length !== BLUE_NOISE_LUT_SIZE * BLUE_NOISE_LUT_SIZE) {
    throw new Error(
      `LUT length ${lut.length} != ${BLUE_NOISE_LUT_SIZE}² — wrong binary?`,
    )
  }
  const wrappedX = ((x % BLUE_NOISE_LUT_SIZE) + BLUE_NOISE_LUT_SIZE) % BLUE_NOISE_LUT_SIZE
  const wrappedY = ((y % BLUE_NOISE_LUT_SIZE) + BLUE_NOISE_LUT_SIZE) % BLUE_NOISE_LUT_SIZE
  const raw = lut[wrappedY * BLUE_NOISE_LUT_SIZE + wrappedX]
  return Math.floor((raw * patternSize) / 256)
}

/**
 * Stable sort of candidate indices by `palette[idx, axis]`.
 *
 * Yliluoma's variant sorts by lightness so low-threshold positions
 * (dark blue-noise values) get the darkest candidate and vice-versa
 * — this makes the dither pattern look like graceful tone-mapping
 * rather than random noise. `axis = 0` matches OKLab/CIE Lab where
 * the first component is L.
 *
 * Stable so repeated candidates keep their first-pick order, matching
 * numpy's stable argsort.
 */
export function candidatesSortedByAxis(
  candidates: ReadonlyArray<number>,
  palette: ReadonlyArray<number>,
  dim: number,
  axis = 0,
): number[] {
  return candidates
    .map((idx, i) => ({ idx, i, key: palette[idx * dim + axis] }))
    .sort((a, b) => {
      if (a.key !== b.key) return a.key - b.key
      return a.i - b.i // stable: preserve insertion order on ties
    })
    .map((x) => x.idx)
}
