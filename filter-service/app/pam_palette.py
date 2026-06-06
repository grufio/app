"""
PAM (Partitioning Around Medoids) palette-medoid selection.

Implementation of Kaufman & Rousseeuw (1987), "Clustering by Means of
Medoids" — the standard k-medoid clustering algorithm. Used to pick `k`
chip indices from a palette pool that minimise the total distance from
a set of source points (e.g. cell means) to their nearest chip.

Replacement for the count-based `reduce_to_top_n` (`palette_reduction.py`)
which keeps the most-frequent snap winners. Count-based reduction is
dominant-preserving but spread-unaware: a small saturated region whose
chips don't make the top-N gets re-snapped to whatever was popular,
losing the colour cluster entirely. PAM is spread-optimal: it
minimises total snap distance over the whole image, so rare-but-
distinct colour clusters keep a representative.

Two phases per Kaufman & Rousseeuw:
  - BUILD: greedy init. First medoid minimises Σ_i D[i, m]; each
    subsequent medoid picks the candidate with the largest cost
    improvement when added.
  - SWAP: local search. For each (current medoid, non-medoid candidate)
    pair compute the cost change if we swap; apply the best
    improving swap until no improvement exists.

The implementation is distance-metric agnostic: callers precompute the
(N, M) distance matrix `D` using OKLab squared-Euclidean, CIEDE2000, or
any other metric and pass it in. This keeps PAM purely algorithmic.

A `lib/editor/trace/pam-palette.ts` mirror runs in the client preview;
parity is asserted by the same constructed test cases.

This module is purely additive — no caller wires it into the trace
pipeline yet. PR-F integrates PAM into the snap step; PR-C just
provides the algorithm + parity-tested correctness against known
constructions.
"""
from __future__ import annotations

import numpy as np


def _total_cost(D: np.ndarray, medoids: np.ndarray, weights: np.ndarray | None) -> float:
    """Σ_i w_i · min_j D[i, medoid_j], the PAM objective."""
    nearest = D[:, medoids].min(axis=1)
    if weights is None:
        return float(nearest.sum())
    return float((nearest * weights).sum())


def _build_phase(
    D: np.ndarray, k: int, weights: np.ndarray | None
) -> list[int]:
    """Greedy initialisation per Kaufman & Rousseeuw §2.2.

    First medoid m_0 minimises Σ_i w_i · D[i, m] over all candidates m.
    Each subsequent medoid maximises the (weighted) sum of positive
    cost reductions across all points.
    """
    N, M = D.shape
    w = np.ones(N, dtype=np.float64) if weights is None else np.asarray(weights, dtype=np.float64)

    # m_0: candidate column with the smallest weighted-sum distance.
    col_costs = (D * w[:, None]).sum(axis=0)
    first = int(np.argmin(col_costs))
    medoids = [first]
    # nearest_dist[i] = D[i, current_nearest_medoid]
    nearest_dist = D[:, first].copy()

    for _ in range(1, k):
        # Improvement[c] = Σ_i w_i · max(0, nearest_dist[i] - D[i, c]).
        # Highest-improvement candidate becomes the next medoid.
        gain = np.maximum(0.0, nearest_dist[:, None] - D) * w[:, None]
        # Mask out candidates already chosen so we don't pick a duplicate.
        improvements = gain.sum(axis=0)
        improvements[medoids] = -np.inf
        nxt = int(np.argmax(improvements))
        medoids.append(nxt)
        nearest_dist = np.minimum(nearest_dist, D[:, nxt])

    return medoids


def _swap_phase(
    D: np.ndarray,
    medoids: list[int],
    weights: np.ndarray | None,
    max_swaps: int,
) -> list[int]:
    """Local-search refinement per Kaufman & Rousseeuw §2.3.

    Try every (medoid → non-medoid) swap; apply the best improving one;
    repeat until no swap reduces cost or `max_swaps` is reached. This
    is the classical PAM swap — not FasterPAM (Schubert & Rousseeuw
    2019), which would give O(N·M) per iteration vs O(k(M-k)·N) here.
    For our palette sizes (M ≤ 304, k ≤ 128, N typically ≤ 100k) the
    classical version converges in well under a second.
    """
    N, M = D.shape
    w = np.ones(N, dtype=np.float64) if weights is None else np.asarray(weights, dtype=np.float64)
    medoids = list(medoids)

    for _ in range(max_swaps):
        current_cost = _total_cost(D, np.array(medoids), w)
        non_medoids = [c for c in range(M) if c not in medoids]

        best_delta = 0.0
        best_swap: tuple[int, int] | None = None  # (medoid_idx, new_candidate)

        for mi in range(len(medoids)):
            trial = list(medoids)
            for c in non_medoids:
                trial[mi] = c
                cost = _total_cost(D, np.array(trial), w)
                delta = cost - current_cost
                if delta < best_delta:
                    best_delta = delta
                    best_swap = (mi, c)

        if best_swap is None:
            break
        medoids[best_swap[0]] = best_swap[1]

    return medoids


def pam_select_medoids(
    D: np.ndarray,
    k: int,
    weights: np.ndarray | None = None,
    max_swaps: int = 100,
) -> np.ndarray:
    """Pick `k` medoid indices from `D.shape[1]` candidates.

    Args:
      D:        (N, M) precomputed distance matrix. `D[i, j]` is the
                distance from point `i` (e.g. one cell mean) to
                candidate `j` (e.g. one palette chip). The metric is
                the caller's choice — OKLab squared-Euclidean,
                CIEDE2000, etc.
      k:        Number of medoids to select. Must satisfy `0 < k <= M`.
      weights:  Optional (N,) weights. Use cell-frequency counts for
                weighted clustering (saves running PAM over duplicated
                rows). When `None`, all points weight equally.
      max_swaps: Cap on swap-phase iterations.

    Returns:
      (k,) int64 array of indices into the candidate axis of `D`. The
      result is deterministic for a given `D` (no random init — BUILD
      breaks ties by `np.argmin`, which returns the lowest index, and
      SWAP picks the first strictly-improving swap when costs tie).
    """
    D = np.asarray(D, dtype=np.float64)
    if D.ndim != 2:
        raise ValueError(f"D must be 2-D (N, M); got shape {D.shape}")
    N, M = D.shape
    if not 0 < k <= M:
        raise ValueError(f"k must satisfy 0 < k <= M ({M}); got {k}")
    if weights is not None:
        w = np.asarray(weights, dtype=np.float64)
        if w.shape != (N,):
            raise ValueError(f"weights must have shape ({N},); got {w.shape}")

    medoids = _build_phase(D, k, weights)
    medoids = _swap_phase(D, medoids, weights, max_swaps)
    return np.array(sorted(medoids), dtype=np.int64)
