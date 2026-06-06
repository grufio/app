"""
PAM parity test (server side). The SAME constructed test cases are
asserted in the client mirror `lib/editor/trace/pam-palette.test.ts` —
if client and server diverge, one side fails here.

Algorithm reference: Kaufman & Rousseeuw (1987) §2.2 (BUILD) + §2.3
(SWAP). Correctness is tested against constructions where the
optimal medoid set is known by inspection.
"""
import numpy as np

from app.pam_palette import pam_select_medoids


def _pairwise_sq_euclidean(points: np.ndarray, candidates: np.ndarray) -> np.ndarray:
    """Build the (N, M) squared-Euclidean distance matrix used by every test.

    Tests use this helper so they read at the algorithmic level (points,
    candidates, k) rather than dealing with broadcast plumbing.
    """
    return ((points[:, None, :] - candidates[None, :, :]) ** 2).sum(axis=2)


def test_pam_picks_cluster_centers_for_three_clean_clusters():
    """Three clean clusters of 3 points each in 2-D. Candidates = points.

    With k=3, PAM must return one medoid per cluster — the cluster
    centre, which is the per-cluster medoid since clusters are
    symmetric. The exact returned indices are unambiguous: indices
    1, 4, 7 (the middle point of each cluster).
    """
    points = np.array(
        [
            [0.0, 0.0], [1.0, 0.0], [2.0, 0.0],  # cluster A
            [10.0, 0.0], [11.0, 0.0], [12.0, 0.0],  # cluster B
            [0.0, 10.0], [1.0, 10.0], [2.0, 10.0],  # cluster C
        ]
    )
    D = _pairwise_sq_euclidean(points, points)
    medoids = pam_select_medoids(D, k=3)
    assert medoids.tolist() == [1, 4, 7]


def test_pam_is_deterministic_for_repeated_runs():
    """Same input → same output across repeated calls (no random init)."""
    rng = np.random.default_rng(seed=42)
    points = rng.normal(size=(20, 3))
    D = _pairwise_sq_euclidean(points, points)
    first = pam_select_medoids(D, k=4)
    for _ in range(5):
        np.testing.assert_array_equal(pam_select_medoids(D, k=4), first)


def test_pam_reduces_cost_vs_greedy_only():
    """SWAP phase must produce cost ≤ BUILD phase cost on a constructed
    case where greedy init is suboptimal.

    Five points on a line: [0, 1, 2, 100, 101]. With k=2 the optimal
    medoids are (1, 100) or (1, 101) — clusters {0,1,2} + {100,101}.
    Greedy BUILD picks the point that minimises Σ distance first;
    that's not always one of the optimal medoids, so SWAP has work
    to do. Either way, the SWAP-converged cost must be at least as
    good as picking any other pair.
    """
    points = np.array([[0.0], [1.0], [2.0], [100.0], [101.0]])
    D = _pairwise_sq_euclidean(points, points)
    medoids = pam_select_medoids(D, k=2)

    # Cluster cost = sum of distances from each point to its nearest medoid.
    chosen_cost = D[:, medoids].min(axis=1).sum()
    # Every other 2-subset should not beat the PAM result.
    for i in range(5):
        for j in range(i + 1, 5):
            alt_cost = D[:, [i, j]].min(axis=1).sum()
            assert chosen_cost <= alt_cost + 1e-9


def test_pam_weighted_points_pull_medoids():
    """Weighted variant: heavily-weighted points dominate medoid choice.

    Two equal-size clusters at x=0 and x=10. If we put high weight on
    one specific point of the left cluster, the left-cluster medoid
    becomes that specific point (not the cluster centroid). Verifies
    weights are honoured.
    """
    points = np.array(
        [
            [0.0, 0.0], [1.0, 0.0], [2.0, 0.0],  # left cluster
            [10.0, 0.0], [11.0, 0.0], [12.0, 0.0],  # right cluster
        ]
    )
    D = _pairwise_sq_euclidean(points, points)
    # No weights: left medoid is the middle of the left cluster (index 1).
    unweighted = pam_select_medoids(D, k=2)
    assert 1 in unweighted.tolist()  # middle of left cluster
    # Heavy weight on the leftmost point: it drags the left medoid to itself.
    weights = np.array([100.0, 1.0, 1.0, 1.0, 1.0, 1.0])
    weighted = pam_select_medoids(D, k=2, weights=weights)
    assert 0 in weighted.tolist()  # leftmost point dragged to be a medoid


def test_pam_k_equals_one_returns_single_global_medoid():
    """k=1 should pick the candidate minimising Σ D[:, c]."""
    points = np.array([[0.0], [1.0], [2.0], [3.0], [10.0]])
    D = _pairwise_sq_euclidean(points, points)
    medoids = pam_select_medoids(D, k=1)
    expected = int(np.argmin(D.sum(axis=0)))
    assert medoids.tolist() == [expected]


def test_pam_k_equals_n_returns_all_indices():
    """k = number of candidates: trivial — every candidate is a medoid,
    final cost == 0 since each point's nearest medoid is itself."""
    points = np.array([[0.0, 0.0], [3.0, 0.0], [0.0, 5.0], [7.0, 7.0]])
    D = _pairwise_sq_euclidean(points, points)
    medoids = pam_select_medoids(D, k=4)
    assert medoids.tolist() == [0, 1, 2, 3]


def test_pam_candidates_can_differ_from_points():
    """Realistic palette case: points (cells) ≠ candidates (chips).

    Cells at [0.5, 5.5, 10.5]; candidate chips at [0, 1, 5, 6, 10, 11].
    With k=3, PAM should pick one chip per cell — but which chip is
    perceptually closest to each cell depends on the (asymmetric)
    distance matrix.
    """
    cells = np.array([[0.5], [5.5], [10.5]])
    chips = np.array([[0.0], [1.0], [5.0], [6.0], [10.0], [11.0]])
    D = _pairwise_sq_euclidean(cells, chips)
    medoids = pam_select_medoids(D, k=3)
    # Each medoid must be the nearest-chip for exactly one cell —
    # tie-broken by lower index in argmin. Cell 0.5 ties (0, 1) → 0;
    # cell 5.5 ties (5, 6) → 5; cell 10.5 ties (10, 11) → 10.
    assert medoids.tolist() == [0, 2, 4]


def test_pam_rejects_bad_k():
    """k=0 or k > M must raise — the algorithm has no sane fallback."""
    D = np.zeros((4, 3))
    for bad_k in (0, -1, 4, 100):
        try:
            pam_select_medoids(D, k=bad_k)
        except ValueError:
            continue
        raise AssertionError(f"k={bad_k} should have raised")


def test_pam_rejects_misshapen_weights():
    """weights must match the points axis length."""
    D = np.zeros((5, 3))
    try:
        pam_select_medoids(D, k=2, weights=np.ones(4))
    except ValueError:
        return
    raise AssertionError("misshapen weights should have raised")
