"""
Top-N palette-chip cap shared between pixelate + circulate.

After the snap (and any optional texture step) the per-cell grid may
use more distinct palette chips than the user-requested `num_colors`
cap. Top-N keeps the most-used chips and re-snaps the remaining cells
to the nearest chip in the kept set. Dominant-preserving by
construction — a future k-medoid / spread-aware pick could refine
clustered outputs but the count-based rule is stable and cheap.
"""
from __future__ import annotations

import numpy as np

from .cell_labels import reconstruct_palette_indices
from .ciede2000 import nearest_palette_indices_ciede2000, rgb255_to_cielab
from .oklab import nearest_palette_indices, rgb255_to_oklab


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
