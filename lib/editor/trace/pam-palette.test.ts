/**
 * PAM parity test (client side). The SAME constructed test cases are
 * asserted in the Python mirror `filter-service/tests/test_pam_palette.py`.
 *
 * Algorithm reference: Kaufman & Rousseeuw (1987) §2.2 (BUILD) + §2.3
 * (SWAP). Correctness against constructions where the optimal medoid
 * set is known by inspection — same constructions in both languages
 * so any algorithmic drift fails on both sides.
 */
import { describe, expect, it } from "vitest"

import { distanceMatrixFromRows, pamSelectMedoids } from "./pam-palette"

/**
 * Helper to build the (N, M) squared-Euclidean distance matrix used by
 * every test. Mirror of the Python `_pairwise_sq_euclidean` helper.
 */
function pairwiseSqEuclidean(
  points: ReadonlyArray<ReadonlyArray<number>>,
  candidates: ReadonlyArray<ReadonlyArray<number>>,
) {
  const rows = points.map((p) =>
    candidates.map((c) => {
      let s = 0
      for (let d = 0; d < p.length; d += 1) {
        const diff = p[d] - c[d]
        s += diff * diff
      }
      return s
    }),
  )
  return distanceMatrixFromRows(rows)
}

describe("pamSelectMedoids — constructed correctness (server parity)", () => {
  it("picks cluster centres for three clean clusters", () => {
    const points = [
      [0, 0], [1, 0], [2, 0],
      [10, 0], [11, 0], [12, 0],
      [0, 10], [1, 10], [2, 10],
    ]
    const D = pairwiseSqEuclidean(points, points)
    expect(pamSelectMedoids(D, 3)).toEqual([1, 4, 7])
  })

  it("is deterministic across repeated runs", () => {
    // Constructed input (not random — TS has no seedable RNG mirror in this
    // file; the Python test seeds numpy. Same fixed input both sides.)
    const points = [
      [0, 0, 0], [0.5, 0.1, -0.1], [10, 0, 0], [10.2, 0.3, 0.1],
      [0, 10, 0], [0.1, 10.1, 0.2], [10, 10, 10], [10.5, 9.8, 9.9],
    ]
    const D = pairwiseSqEuclidean(points, points)
    const first = pamSelectMedoids(D, 4)
    for (let i = 0; i < 5; i += 1) {
      expect(pamSelectMedoids(D, 4)).toEqual(first)
    }
  })

  it("SWAP phase produces cost ≤ any other 2-subset on the line case", () => {
    const points = [[0], [1], [2], [100], [101]]
    const D = pairwiseSqEuclidean(points, points)
    const medoids = pamSelectMedoids(D, 2)

    const cost = (subset: number[]) => {
      let s = 0
      for (let i = 0; i < D.N; i += 1) {
        let best = Infinity
        for (const m of subset) {
          const d = D.data[i * D.M + m]
          if (d < best) best = d
        }
        s += best
      }
      return s
    }
    const chosenCost = cost(medoids)
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) {
        expect(chosenCost).toBeLessThanOrEqual(cost([i, j]) + 1e-9)
      }
    }
  })

  it("weighted points pull medoids", () => {
    const points = [
      [0, 0], [1, 0], [2, 0],
      [10, 0], [11, 0], [12, 0],
    ]
    const D = pairwiseSqEuclidean(points, points)
    const unweighted = pamSelectMedoids(D, 2)
    expect(unweighted).toContain(1) // middle of left cluster
    const weighted = pamSelectMedoids(D, 2, { weights: [100, 1, 1, 1, 1, 1] })
    expect(weighted).toContain(0) // leftmost dragged to be medoid
  })

  it("k=1 returns the single global medoid", () => {
    const points = [[0], [1], [2], [3], [10]]
    const D = pairwiseSqEuclidean(points, points)
    const medoids = pamSelectMedoids(D, 1)
    // Expected: candidate column with smallest Σ D[:, c].
    const colSums = Array.from({ length: D.M }, (_, c) => {
      let s = 0
      for (let i = 0; i < D.N; i += 1) s += D.data[i * D.M + c]
      return s
    })
    const expected = colSums.indexOf(Math.min(...colSums))
    expect(medoids).toEqual([expected])
  })

  it("k=N returns every candidate index", () => {
    const points = [[0, 0], [3, 0], [0, 5], [7, 7]]
    const D = pairwiseSqEuclidean(points, points)
    expect(pamSelectMedoids(D, 4)).toEqual([0, 1, 2, 3])
  })

  it("supports points ≠ candidates (palette-restriction case)", () => {
    const cells = [[0.5], [5.5], [10.5]]
    const chips = [[0], [1], [5], [6], [10], [11]]
    const D = pairwiseSqEuclidean(cells, chips)
    expect(pamSelectMedoids(D, 3)).toEqual([0, 2, 4])
  })

  it("rejects bad k", () => {
    const D = distanceMatrixFromRows([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])
    for (const badK of [0, -1, 4, 100]) {
      expect(() => pamSelectMedoids(D, badK)).toThrow()
    }
  })

  it("rejects misshapen weights", () => {
    const D = distanceMatrixFromRows([
      [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
    ])
    expect(() => pamSelectMedoids(D, 2, { weights: [1, 1, 1, 1] })).toThrow()
  })
})
