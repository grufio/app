/**
 * PAM (Partitioning Around Medoids) palette-medoid selection — client side.
 *
 * Mirror of `filter-service/app/pam_palette.py`. Same BUILD + SWAP
 * phases per Kaufman & Rousseeuw (1987); byte-equivalent output against
 * the server (asserted by the same constructed test cases in both
 * `pam-palette.test.ts` and `test_pam_palette.py`).
 *
 * Replacement for the count-based `reduce_to_top_n` palette cap, which
 * keeps the most-frequent snap winners. Count-based reduction is
 * dominant-preserving but spread-unaware: a small saturated region
 * whose chips don't make the top-N gets re-snapped to whatever was
 * popular, losing the colour cluster entirely. PAM is spread-optimal:
 * it minimises total snap distance over the whole image, so rare-but-
 * distinct colour clusters keep a representative.
 *
 * Two phases:
 *   - BUILD: greedy init. First medoid minimises Σ_i D[i, m]; each
 *     subsequent medoid picks the candidate with the largest cost
 *     improvement when added.
 *   - SWAP: local search. For each (current medoid, non-medoid
 *     candidate) pair compute the cost change if we swap; apply the
 *     best improving swap until no improvement exists.
 *
 * Distance-metric agnostic — callers precompute the (N, M) distance
 * matrix `D` using OKLab squared-Euclidean, CIEDE2000, or any other
 * metric and pass it in. PR-C ships PAM as a pure building block; PR-F
 * wires it into the snap pipeline.
 */

/**
 * A flat (N, M) distance matrix stored in row-major order: `D[i*M + j]`
 * is the distance from point `i` to candidate `j`. `N` is `data.length /
 * M` (with `data.length % M === 0` asserted at the boundary).
 */
export type DistanceMatrix = {
  readonly data: Float64Array
  readonly N: number
  readonly M: number
}

/** Build a `DistanceMatrix` from a nested array `D[i][j]`. */
export function distanceMatrixFromRows(rows: ReadonlyArray<ReadonlyArray<number>>): DistanceMatrix {
  const N = rows.length
  const M = N === 0 ? 0 : rows[0].length
  const data = new Float64Array(N * M)
  for (let i = 0; i < N; i += 1) {
    if (rows[i].length !== M) {
      throw new Error(`distanceMatrixFromRows: ragged row ${i} (got ${rows[i].length}, expected ${M})`)
    }
    for (let j = 0; j < M; j += 1) data[i * M + j] = rows[i][j]
  }
  return { data, N, M }
}

function totalCost(D: DistanceMatrix, medoids: ReadonlyArray<number>, weights: ReadonlyArray<number> | null): number {
  let cost = 0
  for (let i = 0; i < D.N; i += 1) {
    let best = Infinity
    const rowBase = i * D.M
    for (let mi = 0; mi < medoids.length; mi += 1) {
      const d = D.data[rowBase + medoids[mi]]
      if (d < best) best = d
    }
    cost += weights === null ? best : best * weights[i]
  }
  return cost
}

function buildPhase(D: DistanceMatrix, k: number, weights: ReadonlyArray<number> | null): number[] {
  // First medoid: column with the smallest weighted-sum distance.
  let bestFirst = 0
  let bestFirstCost = Infinity
  for (let j = 0; j < D.M; j += 1) {
    let col = 0
    for (let i = 0; i < D.N; i += 1) {
      const d = D.data[i * D.M + j]
      col += weights === null ? d : d * weights[i]
    }
    if (col < bestFirstCost) {
      bestFirstCost = col
      bestFirst = j
    }
  }
  const medoids: number[] = [bestFirst]

  // nearest[i] = D[i, current_nearest_medoid]
  const nearest = new Float64Array(D.N)
  for (let i = 0; i < D.N; i += 1) nearest[i] = D.data[i * D.M + bestFirst]

  const inMedoids = new Uint8Array(D.M)
  inMedoids[bestFirst] = 1

  for (let step = 1; step < k; step += 1) {
    let bestGain = -Infinity
    let bestCandidate = -1
    for (let c = 0; c < D.M; c += 1) {
      if (inMedoids[c]) continue
      let gain = 0
      for (let i = 0; i < D.N; i += 1) {
        const d = D.data[i * D.M + c]
        if (d < nearest[i]) {
          const delta = nearest[i] - d
          gain += weights === null ? delta : delta * weights[i]
        }
      }
      if (gain > bestGain) {
        bestGain = gain
        bestCandidate = c
      }
    }
    if (bestCandidate < 0) break // can happen only if M < k (already validated)
    medoids.push(bestCandidate)
    inMedoids[bestCandidate] = 1
    for (let i = 0; i < D.N; i += 1) {
      const d = D.data[i * D.M + bestCandidate]
      if (d < nearest[i]) nearest[i] = d
    }
  }

  return medoids
}

function swapPhase(
  D: DistanceMatrix,
  initial: number[],
  weights: ReadonlyArray<number> | null,
  maxSwaps: number,
): number[] {
  const medoids = [...initial]
  for (let iter = 0; iter < maxSwaps; iter += 1) {
    const currentCost = totalCost(D, medoids, weights)
    let bestDelta = 0
    let bestSwap: { mi: number; c: number } | null = null

    for (let mi = 0; mi < medoids.length; mi += 1) {
      const trial = [...medoids]
      for (let c = 0; c < D.M; c += 1) {
        if (medoids.includes(c)) continue
        trial[mi] = c
        const cost = totalCost(D, trial, weights)
        const delta = cost - currentCost
        if (delta < bestDelta) {
          bestDelta = delta
          bestSwap = { mi, c }
        }
      }
    }
    if (bestSwap === null) break
    medoids[bestSwap.mi] = bestSwap.c
  }
  return medoids
}

/**
 * Pick `k` medoid indices from the candidate axis of `D`. See module
 * doc for the algorithm; tie-breaks via the lowest-index winner of
 * `argmin` (matches the Python `np.argmin` semantics) so PAM is
 * deterministic.
 *
 * @throws when `k` is outside `(0, M]` or `weights.length !== N`.
 */
export function pamSelectMedoids(
  D: DistanceMatrix,
  k: number,
  options: { weights?: ReadonlyArray<number>; maxSwaps?: number } = {},
): number[] {
  if (!(0 < k && k <= D.M)) {
    throw new Error(`pamSelectMedoids: k must satisfy 0 < k <= ${D.M}; got ${k}`)
  }
  const weights = options.weights ?? null
  if (weights !== null && weights.length !== D.N) {
    throw new Error(`pamSelectMedoids: weights.length must equal N (${D.N}); got ${weights.length}`)
  }
  const maxSwaps = options.maxSwaps ?? 100
  const built = buildPhase(D, k, weights)
  const swapped = swapPhase(D, built, weights, maxSwaps)
  return swapped.slice().sort((a, b) => a - b)
}
