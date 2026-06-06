"""
Knoll-Yliluoma "arbitrary-palette positional dithering algorithm"
(Yliluoma 2014) — candidate selection + threshold-position lookup.

The algorithm replaces single-chip snapping with N-candidate sub-
sampling: each cell selects N palette chips whose RUNNING MEAN
approximates the cell's target colour, then a positional threshold
(blue-noise LUT) picks one of those N chips per cell. Adjacent cells
hitting different threshold bins emit different chips, so a uniform
target region renders as a pleasing N-chip mix — the spatial-
quantization property that classical "single-snap" misses (and that
Ulichney neighbour-invasion can't deliver on monochrome input,
because its decision depends on neighbour colours that don't yet
differ).

Reference: Joel Yliluoma (2014), "Joel Yliluoma's arbitrary-palette
positional dithering algorithm" — the candidate-selection scheme is
Knoll's; the explicit positional sort + threshold mapping is
Yliluoma's contribution.

Two pure pieces in this module:
  - `knoll_yliluoma_candidates` — given target + palette + N, returns
    the N candidate chip indices (with multiplicity, since the same
    chip may be picked twice when the target is close to it).
  - `threshold_bin` — given (x, y) + LUT + N, returns the candidate
    rank ∈ [0, N) to emit at that position.

The full pipeline composition (loop over cells, sort candidates by
lightness, look up threshold bin, emit chip RGB) lives in PR-F so the
algorithm itself stays small + parity-testable in isolation.

A `lib/editor/trace/knoll-yliluoma.ts` mirror runs in the client
preview; parity is asserted by the same constructed test cases.

Distance metric: the algorithm uses squared-Euclidean over the
provided palette space. Callers choose the space (OKLab from
`oklab.py`, CIE Lab from `ciede2000.py`, or any other linear-ish
space) — the candidate-mean target colour is computed in that same
space, so averaging works as long as the space is approximately
linear in perceptual mixing.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

# Reuse the same 256×256 blue-noise LUT already used by `cell_texture.py`
# so the dithering pattern is consistent with the existing texture step.
# Same binary is served to the browser via `public/assets/blue-noise-256.bin`
# so client previews use byte-identical thresholds.
_LUT_PATH = Path(__file__).parent / "data" / "blue_noise_256.bin"
BLUE_NOISE_LUT: np.ndarray = np.fromfile(_LUT_PATH, dtype=np.uint8).reshape(256, 256)


def knoll_yliluoma_candidates(
    target: np.ndarray,
    palette: np.ndarray,
    pattern_size: int,
) -> np.ndarray:
    """Pick `pattern_size` palette indices whose running mean
    approximates `target`.

    Algorithm (Yliluoma 2014, §2):
      At step `i` (1-indexed), the running mean after picking `c_i`
      will be `(sum_prev + palette[c_i]) / i`. We want that mean to
      approximate `target`, so we pick
            `c_i = argmin_j ‖palette[j] - (target·i - sum_prev)‖²`.
      That residual target `target·i - sum_prev` is exactly the chip
      whose addition makes the running mean coincide with `target`.

    The first pick (i=1) collapses to plain nearest-neighbour: the
    residual target equals `target` itself with sum_prev = 0. Each
    subsequent pick corrects the residual error from the running
    mean — so the running mean asymptotically tracks `target` even
    when no single palette chip is close.

    Args:
      target:        (3,) target colour in the palette's space.
      palette:       (M, 3) palette in the same space.
      pattern_size:  N ≥ 1; the number of candidates to pick. N=1
                     degenerates to plain nearest-neighbour.

    Returns:
      (N,) int64 indices into `palette` (may repeat — the same chip
      can be picked multiple times when target is close to it).
    """
    if pattern_size < 1:
        raise ValueError(f"pattern_size must be ≥ 1; got {pattern_size}")
    target = np.asarray(target, dtype=np.float64)
    palette = np.asarray(palette, dtype=np.float64)
    if target.shape != (palette.shape[1],):
        raise ValueError(
            f"target shape {target.shape} doesn't match palette feature dim {palette.shape[1]}"
        )

    candidates = np.empty(pattern_size, dtype=np.int64)
    cumulative_sum = np.zeros_like(target)
    for i in range(1, pattern_size + 1):
        residual_target = target * i - cumulative_sum
        d = ((palette - residual_target) ** 2).sum(axis=1)
        chosen = int(np.argmin(d))
        candidates[i - 1] = chosen
        cumulative_sum += palette[chosen]
    return candidates


def threshold_bin(
    x: int, y: int, pattern_size: int, lut: np.ndarray = BLUE_NOISE_LUT
) -> int:
    """Position → candidate rank ∈ `[0, pattern_size)`.

    The 256×256 blue-noise LUT distributes values 0..255 organically
    (no banding, no clusters per Ulichney 1993 void-and-cluster).
    Mapping into N equal-width bins gives a sequence of N-tone
    thresholds that look pleasant on uniform fields.

    Tile via `% 256` so positions outside the LUT wrap deterministically
    — the same `(x, y)` always lands on the same threshold value
    regardless of image size.
    """
    if pattern_size < 1:
        raise ValueError(f"pattern_size must be ≥ 1; got {pattern_size}")
    raw = int(lut[y % 256, x % 256])
    return (raw * pattern_size) // 256


def candidates_sorted_by_axis(
    candidates: np.ndarray, palette: np.ndarray, axis: int = 0
) -> np.ndarray:
    """Stable sort of candidate indices by `palette[idx, axis]`.

    Yliluoma's variant sorts by lightness so low-threshold positions
    (dark blue-noise values) get the darkest candidate and vice-versa
    — this makes the dither pattern look like graceful tone-mapping
    rather than random noise. `axis = 0` matches OKLab/CIE Lab where
    the first component is L.

    Stable so repeated candidates keep their first-pick order, which
    matters for parity between languages (numpy and Array.sort agree
    only on stable orderings).
    """
    palette = np.asarray(palette, dtype=np.float64)
    keys = palette[candidates, axis]
    order = np.argsort(keys, kind="stable")
    return candidates[order]
