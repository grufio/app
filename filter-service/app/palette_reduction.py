"""
Palette-cap dispatch shared between pixelate + circulate.

Two strategies, picked by the `palette_restriction` schema field
(PR-I):

  - `reduce_to_top_n` — POST-snap count-based cap. Snap cells to the
    full palette first, histogram the winners, keep the `num_colors`
    most-frequent chips, re-snap excluded cells to the nearest kept.
    Dominant-preserving but spread-unaware — a small distinct cluster
    whose chips don't make the top-N gets re-snapped to whatever was
    popular and loses the cluster.

  - `restrict_palette_pam` — PRE-snap k-medoid restriction (Kaufman &
    Rousseeuw 1987 via `pam_palette.py`). Builds the cell-mean
    histogram, runs weighted PAM against the full palette, returns a
    `num_colors`-chip subset. The caller then snaps (or dithers)
    against the restricted palette and SKIPS the post-snap reduce.
    Spread-optimal: minimises total snap distance over the whole
    image, so rare-but-distinct clusters keep a representative.

Both honour `distance_metric` (PR-H): the re-snap and PAM cost
function both run in the active metric's space.
"""
from __future__ import annotations

import numpy as np

from .cell_labels import reconstruct_palette_indices
from .ciede2000 import nearest_palette_indices_ciede2000, rgb255_to_cielab
from .oklab import nearest_palette_indices, rgb255_to_oklab
from .pam_palette import pam_select_medoids


def reduce_to_top_n(
    cells_rgb: np.ndarray,
    palette_oklab,
    palette_rgb,
    num_colors: int | None,
    distance_metric: str = "oklab",
) -> tuple[np.ndarray, bool]:
    """Cap distinct palette chips in `cells_rgb` to at most `num_colors`.

    `cells_rgb` must be post-snap — every cell colour is expected to be
    an exact palette chip (mirrors the contract of
    `reconstruct_palette_indices`).

    Returns `(reduced, did_reduce)`. `did_reduce` is True iff the
    pre-reduction grid used more than `num_colors` distinct chips, in
    which case `reduced` is a re-snapped copy. False otherwise, with
    `cells_rgb` returned unchanged.

    `distance_metric` (PR-H) picks the re-snap metric for excluded
    cells: `"oklab"` keeps the pre-feature OKLab squared-Euclidean
    argmin; `"ciede2000"` switches to CIE Lab D65 + ΔE00 so the
    excluded cells re-snap to the perceptually-closest chip in the
    kept set.
    """
    if num_colors is None or num_colors <= 0:
        return cells_rgb, False
    palette_rgb_arr = np.asarray(palette_rgb, dtype=np.uint8)
    pre_indices = reconstruct_palette_indices(cells_rgb, palette_rgb_arr)
    unique, counts = np.unique(pre_indices, return_counts=True)
    if len(unique) <= num_colors:
        return cells_rgb, False
    top_n = unique[np.argsort(counts)[-num_colors:]]
    top_n_rgb = palette_rgb_arr[top_n]
    excluded_mask = ~np.isin(pre_indices, top_n)
    flat = cells_rgb.reshape(-1, 3).copy()
    excluded_flat = excluded_mask.flatten()
    if distance_metric == "ciede2000":
        excluded_lab = rgb255_to_cielab(flat[excluded_flat])
        top_n_lab = rgb255_to_cielab(top_n_rgb)
        local = nearest_palette_indices_ciede2000(excluded_lab, top_n_lab)
    else:
        top_n_oklab = np.asarray(palette_oklab, dtype=np.float32)[top_n]
        excluded_oklab = rgb255_to_oklab(flat[excluded_flat])
        local = nearest_palette_indices(excluded_oklab, top_n_oklab)
    flat[excluded_flat] = top_n_rgb[local]
    return flat.reshape(cells_rgb.shape), True


def _pack_rgb(arr: np.ndarray) -> np.ndarray:
    """Pack (..., 3) uint8 → (...) uint32 by laying out R, G, B in the
    low bytes. Mirror of `palette-reduction.ts::packRgb`. Used to build
    a uniqueness key for cell-mean histograms.
    """
    a32 = arr.astype(np.uint32)
    return (a32[..., 0] << 16) | (a32[..., 1] << 8) | a32[..., 2]


def restrict_palette_pam(
    cell_means_rgb: np.ndarray,
    palette_oklab: np.ndarray,
    palette_rgb: np.ndarray,
    num_colors: int | None,
    distance_metric: str = "oklab",
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Pick `num_colors` medoid chip indices via PAM, return the
    restricted palette views.

    Cell-mean histogram → weighted PAM in the active distance metric's
    space → sorted medoid indices into the full palette. The caller
    snaps (or dithers) against the restricted palette and must
    translate any post-snap palette indices back to the FULL palette
    via the returned `kept_indices` (this is the
    `palette_indices_used` wire contract — paint-by-numbers labels and
    the Colors sheet match on original `palette_index`).

    Returns `(restricted_oklab, restricted_rgb, kept_indices)`:
      - `restricted_oklab` : (k, 3) view into `palette_oklab`
      - `restricted_rgb`   : (k, 3) view into `palette_rgb`
      - `kept_indices`     : (k,) int64; `kept_indices[i]` = index in
                             the FULL palette of the `i`-th chip in the
                             restricted views.

    Short-circuits to the full palette when `num_colors` is None, ≤ 0,
    or ≥ palette size (no restriction needed). In those cases
    `kept_indices` is `arange(palette_size)`.

    Performance: cell-mean histogram caps the PAM input row count to
    `min(N_cells, 256³)` unique colours; in practice ≤ ~10k for any
    real image. M ≤ ~304 chips. Classical PAM is O(k(M-k)·N) per swap
    iteration — comfortably under 1s for our sizes.
    """
    palette_oklab_arr = np.asarray(palette_oklab, dtype=np.float64)
    palette_rgb_arr = np.asarray(palette_rgb, dtype=np.uint8)
    M = palette_rgb_arr.shape[0]
    if num_colors is None or num_colors <= 0 or num_colors >= M:
        # No restriction needed — return full palette + identity index
        # map so callers can treat the PAM and top_n branches
        # interchangeably for `palette_indices_used` translation.
        return palette_oklab_arr, palette_rgb_arr, np.arange(M, dtype=np.int64)

    if distance_metric not in ("oklab", "ciede2000"):
        raise ValueError(f"unknown distance_metric: {distance_metric!r}")

    # Cell-mean histogram: unique uint8 RGB triples + occurrence counts.
    # `np.unique(axis=0)` returns unique rows in lexicographic order;
    # `return_counts=True` gives the weight vector PAM consumes.
    cells_flat = np.asarray(cell_means_rgb, dtype=np.uint8).reshape(-1, 3)
    unique_rgb, counts = np.unique(cells_flat, axis=0, return_counts=True)

    # Build the (N_unique, M) distance matrix in the active metric.
    if distance_metric == "ciede2000":
        cells_space = rgb255_to_cielab(unique_rgb)
        palette_space = rgb255_to_cielab(palette_rgb_arr)
        # CIEDE2000 distance matrix via broadcast — mirrors
        # `nearest_palette_indices_ciede2000` but keeps the full matrix
        # instead of taking argmin.
        from .ciede2000 import ciede2000 as _ciede2000

        d = _ciede2000(cells_space[:, None, :], palette_space[None, :, :])
    else:
        cells_space = rgb255_to_oklab(unique_rgb)
        # Squared-Euclidean (matches `nearest_palette_indices`).
        d = ((cells_space[:, None, :] - palette_oklab_arr[None, :, :]) ** 2).sum(axis=2)

    medoids = pam_select_medoids(d, k=int(num_colors), weights=counts.astype(np.float64))
    kept_indices = np.asarray(medoids, dtype=np.int64)
    restricted_oklab = palette_oklab_arr[kept_indices]
    restricted_rgb = palette_rgb_arr[kept_indices]
    return restricted_oklab, restricted_rgb, kept_indices


def translate_palette_indices(
    indices_in_restricted: np.ndarray, kept_indices: np.ndarray
) -> np.ndarray:
    """Translate restricted-palette indices (0..k-1) back to indices
    in the ORIGINAL palette via `kept_indices` from
    `restrict_palette_pam`.

    Paint-by-numbers labels and the editor's Colors sheet match on the
    original `palette_index` — emitting restricted-array positions
    would produce wrong chip names. The Top-N branch implicitly
    preserves original indices (its kept set is already in original
    space); the PAM branch needs this explicit translation.
    """
    return np.asarray(kept_indices, dtype=np.int64)[
        np.asarray(indices_in_restricted, dtype=np.int64)
    ]


# --- paint selection (shared by pixelate/circulate/linerate) ------------------------

_SELECT_SAMPLE = 12000   # subsample pixels for the palette-selection reduction
_SELECT_KMEANS_ITERS = 15


def select_paints(okf_flat, rgb_flat, num_colors, pal_ok, pal_rgb, restriction, seed):
    """Choose ≤num_colors REAL paints from the fixed palette using the SAME shared,
    coverage/frequency-based reduction that pixelate/circulate use (no saliency
    bias — that bias under-represented smooth areas):
      - `pam`   → weighted k-medoids over the palette (`restrict_palette_pam`).
      - `top_n` → snap to the full palette, keep the most-used chips
                  (`reduce_to_top_n`), extract the distinct kept chips.
    Returns (sel_ok, sel_rgb, pal_index); pal_index[i] = full-palette index of
    paint i (−1 if no palette). Deterministic (top_n/PAM have no RNG). Without a
    palette (tests) falls back to plain unweighted k-means centroids.

    Shared by linerate (per-pixel snap → facets) and linerate (per-pixel snap →
    vtracer). Lives here, not in linerate, so linerate doesn't pull in cv2/the
    segmentation machinery."""
    K = max(2, int(num_colors))
    X = okf_flat.astype(np.float32)
    rng = np.random.default_rng(seed)
    # the reduction only needs a representative subset of pixels
    if len(X) > _SELECT_SAMPLE:
        idx = rng.choice(len(X), _SELECT_SAMPLE, replace=False)
        Xs, rgbs = X[idx], rgb_flat[idx]
    else:
        Xs, rgbs = X, rgb_flat

    if pal_ok is not None and pal_rgb is not None:
        if restriction == "pam":
            # Snap to the palette FIRST → the PAM histogram sees ≤len(palette)
            # unique colours (not ~12k raw pixel colours), so weighted k-medoids
            # runs over the used chips and is instant. (Feeding raw pixels made
            # PAM ~36s — the "PAM stays stuck" report.)
            snapped = pal_rgb[nearest_palette_indices(Xs, pal_ok)].reshape(-1, 1, 3)
            sel_ok, sel_rgb, kept = restrict_palette_pam(
                snapped, pal_ok, pal_rgb, K, distance_metric="oklab"
            )
            return np.asarray(sel_ok, np.float64), np.asarray(sel_rgb, np.uint8), np.asarray(kept, np.int32)
        # top_n: snap the subsample to the full palette, keep the top-K used chips
        snapped = pal_rgb[nearest_palette_indices(Xs, pal_ok)].reshape(-1, 1, 3)
        reduced, _ = reduce_to_top_n(snapped, pal_ok, pal_rgb, K, distance_metric="oklab")
        sel = np.unique(reconstruct_palette_indices(reduced, pal_rgb)).astype(np.int32)
        return pal_ok[sel], pal_rgb[sel], sel

    # no palette (tests only): plain k-means centroids as their own paints
    C = Xs[rng.choice(len(Xs), min(K, len(Xs)), replace=False)].copy()
    a = np.zeros(len(Xs), np.int64)
    for _ in range(_SELECT_KMEANS_ITERS):
        a = (((Xs[:, None, :] - C[None, :, :]) ** 2).sum(2)).argmin(1)
        for k in range(len(C)):
            m = a == k
            if m.any():
                C[k] = Xs[m].mean(0)
    sel_rgb = np.zeros((len(C), 3), np.uint8)
    for k in range(len(C)):
        m = a == k
        if m.any():
            sel_rgb[k] = rgbs[m].mean(0)
    return C.astype(np.float64), sel_rgb, np.full(len(C), -1, np.int32)
