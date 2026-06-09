"""
Shared per-cell color detection for trace filters (server side).

The single place where a trace turns the cropped source into per-cell
colours — used by Pixelate and (soon) Circulate and any future trace, so a
change to the colour model is made in ONE spot. Client mirror:
`lib/editor/trace/trace-cell-colors.ts`.

Today: a per-cell area-average via `Image.BOX` (1 cell = 1 px). The
palette-map step (nearest Munsell chip via `oklab.py`, from the DB
`lab_munsell` / `lab_grays` tables) hooks in on top of this in a later stage
— no intermediate median-cut quantise (that would pick random colours and
then re-map to the fixed palette = double loss; direct mean → palette is
single-step).
"""
from __future__ import annotations

import numpy as np
from PIL import Image

from .cell_texture import apply_neighbor_invasion
from .ciede2000 import nearest_palette_indices_ciede2000, rgb255_to_cielab
from .floyd_steinberg import floyd_steinberg_dither
from .knoll_yliluoma import (
    BLUE_NOISE_LUT,
    candidates_sorted_by_axis,
    knoll_yliluoma_candidates,
    threshold_bin,
)
from .oklab import adjust_oklab, nearest_palette_indices, rgb255_to_oklab

# `distance_metric` PR-H — keep the enum values in sync with the Zod
# slice (`lib/editor/trace/distance-metric-schema.ts`). The parity test
# (`python-parity.test.ts`) verifies that.
_VALID_DISTANCE_METRICS = ("oklab", "ciede2000")

# `dither_mode` values — kept in sync with `DITHER_MODES` in
# `lib/editor/trace/dither-mode-schema.ts`. The parity test pins both
# sides.
_VALID_DITHER_MODES = ("none", "knoll_yliluoma", "floyd_steinberg", "texture")


def _strength_to_ky_n(strength: float) -> int:
    """Map a continuous strength fraction to the Knoll-Yliluoma
    candidate count `N`.

    The wire contract is a discrete set `{0.25, 0.5, 0.75, 1.0}` but we
    dispatch by RANGE (not equality) so a JSON round-trip's float drift
    can't slip a request into the wrong bucket. Boundaries are halfway
    between the discrete steps:

      strength <= 0.375 → N = 2   (≈ 25 %)
      strength <= 0.625 → N = 4   (≈ 50 %)
      strength <= 0.875 → N = 8   (≈ 75 %)
      otherwise         → N = 16  (≈ 100 %)
    """
    if strength <= 0.375:
        return 2
    if strength <= 0.625:
        return 4
    if strength <= 0.875:
        return 8
    return 16


def _snap_indices(
    cells_rgb_flat: np.ndarray,
    palette_oklab: np.ndarray,
    palette_rgb: np.ndarray,
    pre_snap_chroma_scale: float,
    distance_metric: str,
) -> np.ndarray:
    """Cell-RGB → palette-chip indices via the selected distance metric.

    - `"oklab"`     : convert cells to OKLab (optionally chroma-boosted),
                      argmin via squared-Euclidean against `palette_oklab`.
                      Pre-PR-H behaviour, byte-identical to the previous
                      `nearest_palette_indices` call site.
    - `"ciede2000"` : convert cells to CIE Lab D65, convert
                      `palette_rgb` to CIE Lab D65 on the fly (cheap;
                      ~300 chips), argmin via ΔE00 against the palette
                      Lab vectors. The OKLCh `pre_snap_chroma_scale`
                      boost is SKIPPED here because the math is
                      OKLCh-specific — see `distance-metric-schema.ts`.

    The helper is shared between `map_cells_to_palette`,
    `map_cells_dithered` (none-path), `circulate._inner_colors` and
    `palette_reduction.reduce_to_top_n`'s re-snap step so the dispatch
    lives in one place.
    """
    cells = np.asarray(cells_rgb_flat, dtype=np.uint8).reshape(-1, 3)
    if distance_metric == "ciede2000":
        cells_lab = rgb255_to_cielab(cells)
        palette_lab = rgb255_to_cielab(np.asarray(palette_rgb, dtype=np.uint8))
        return nearest_palette_indices_ciede2000(cells_lab, palette_lab)
    # default "oklab" path
    cells_oklab = rgb255_to_oklab(cells)
    if pre_snap_chroma_scale != 1.0:
        cells_oklab = adjust_oklab(cells_oklab, chroma_scale=pre_snap_chroma_scale)
    return nearest_palette_indices(cells_oklab, palette_oklab)


def compute_cell_colors(cropped: Image.Image, cells_x: int, cells_y: int) -> np.ndarray:
    """Downsample the cropped image straight to a `cells_x × cells_y` grid
    (1 cell = 1 px, area-averaged via `Image.BOX`) and return the
    `(cells_y, cells_x, 3)` uint8 RGB array of per-cell mean colours.

    No longer called by pixelate's main path — the Vercel server now does
    crop + area-average and ships the cell grid directly (see
    `pixelate_cells_to_svg`). Still used by `circulate.py` and by the
    legacy `pixelate_to_svg` back-compat path.
    """
    cell_grid = cropped.resize((cells_x, cells_y), Image.BOX)
    return np.asarray(cell_grid, dtype=np.uint8)


def map_cells_to_palette(
    cell_means: np.ndarray,
    palette_oklab: np.ndarray,
    palette_rgb: np.ndarray,
    pre_snap_chroma_scale: float = 1.0,
    distance_metric: str = "oklab",
) -> np.ndarray:
    """Snap each per-cell mean colour to the nearest palette chip.

    `cell_means` is the `(cells_y, cells_x, 3)` uint8 array from
    `compute_cell_colors`. `palette_oklab` (M, 3) and `palette_rgb` (M, 3
    uint8) are the chips of the active palette (active-tier `lab_munsell`
    + `lab_grays` appended for colour, `lab_grays` for b/w) — the OKLab
    columns straight from the DB, so the chip space matches color-lab.
    Each cell mean is converted to the active metric's space and
    replaced by the RGB of its nearest chip. Returns `(cells_y, cells_x, 3)`
    uint8.

    `pre_snap_chroma_scale` (default `1.0` = no-op = pre-feature
    behaviour) multiplies the cell mean's OKLCh chroma BEFORE the
    nearest-chip argmin. Values > 1.0 push dull-averaged cells toward
    saturated chips, spreading the picked chip-set across more of the
    palette. See `lib/editor/trace/chroma-scale-schema.ts` for the
    range + default-1.0 rationale. Honoured only on the `"oklab"`
    path; the `"ciede2000"` path skips the boost since OKLCh ≠ CIE LCh
    (see `distance-metric-schema.ts`).

    `distance_metric` (default `"oklab"`) picks the snap metric:
    `"oklab"` keeps the pre-PR-H squared-Euclidean snap; `"ciede2000"`
    switches to CIE Lab D65 + ΔE00 via `ciede2000.py`.
    """
    shape = np.asarray(cell_means).shape
    idx = _snap_indices(
        np.asarray(cell_means).reshape(-1, 3),
        palette_oklab,
        palette_rgb,
        pre_snap_chroma_scale,
        distance_metric,
    )
    mapped = np.asarray(palette_rgb, dtype=np.uint8)[idx]
    return mapped.reshape(shape)


def _ky_dither_indices(
    cells_oklab_2d: np.ndarray,
    palette_oklab: np.ndarray,
    pattern_size: int,
) -> np.ndarray:
    """Knoll-Yliluoma dispatch: per-cell candidate-selection +
    lightness-sort + blue-noise threshold pick. Returns (H, W) int64
    palette indices.

    Pattern size collapses to plain nearest-neighbour when `pattern_size
    == 1` (Yliluoma 2014 §2 — the first candidate is always argmin).
    The threshold lookup uses the module-shared `BLUE_NOISE_LUT` so
    placement matches the existing texture step's blue-noise binary.

    Lightness sort axis = 0 (OKLab L) so the darkest candidate lands on
    the low-threshold positions and the brightest on the high — implied
    tone-mapping rather than random noise.
    """
    H, W, _ = cells_oklab_2d.shape
    out = np.empty((H, W), dtype=np.int64)
    for y in range(H):
        for x in range(W):
            candidates = knoll_yliluoma_candidates(
                cells_oklab_2d[y, x], palette_oklab, pattern_size
            )
            sorted_candidates = candidates_sorted_by_axis(
                candidates, palette_oklab, axis=0
            )
            bin_idx = threshold_bin(x, y, pattern_size, BLUE_NOISE_LUT)
            out[y, x] = int(sorted_candidates[bin_idx])
    return out


def map_cells_dithered(
    cell_means: np.ndarray,
    palette_oklab: np.ndarray,
    palette_rgb: np.ndarray,
    pre_snap_chroma_scale: float = 1.0,
    dither_mode: str = "none",
    dither_strength: float = 0.5,
    distance_metric: str = "oklab",
) -> np.ndarray:
    """Snap-or-dither dispatch shared by pixelate + circulate.

    `dither_mode` picks behaviour:
      - `"none"`            → plain snap; metric chosen by
                              `distance_metric` (PR-H — OKLab squared-
                              Euclidean by default, CIEDE2000 on opt-in).
      - `"knoll_yliluoma"`  → per-cell candidate selection +
                              blue-noise threshold pick. ALWAYS in
                              OKLab squared-Euclidean — the
                              algorithm's internal argmin is hardcoded
                              squared-Euclidean and metric-aware KY is
                              out of scope (see `distance-metric-schema.ts`
                              docstring + the plan file).
      - `"floyd_steinberg"` → scan-order error diffusion. Same OKLab
                              constraint as KY. Ignores `dither_strength`.
      - `"texture"`         → plain OKLab snap + blue-noise neighbour
                              invasion (the former separate Texture
                              checkbox). Strength feeds the invasion
                              probability directly.

    KY + FS therefore IGNORE `distance_metric` — only the `"none"` and
    the texture-snap step honour it. Texture's invasion step is
    metric-agnostic (RGB-level).

    All paths run in OKLab space (the `pre_snap_chroma_scale` boost
    happens once up-front IF the snap path uses OKLab) and return the
    same shape `(cells_y, cells_x, 3)` uint8 RGB array — callers
    shouldn't notice which dispatch ran.

    `dither_strength` is a fraction in {0.25, 0.5, 0.75, 1.0} (25/50/
    75/100 %) — see `_strength_to_ky_n` for the KY mapping; texture
    uses the fraction directly as the invasion strength.
    """
    if dither_mode not in _VALID_DITHER_MODES:
        raise ValueError(f"unknown dither_mode: {dither_mode!r}")
    if distance_metric not in _VALID_DISTANCE_METRICS:
        raise ValueError(f"unknown distance_metric: {distance_metric!r}")

    cells = np.asarray(cell_means)
    shape = cells.shape
    palette_oklab_arr = np.asarray(palette_oklab, dtype=np.float64)
    palette_rgb_arr = np.asarray(palette_rgb, dtype=np.uint8)

    if dither_mode == "none":
        # Single dispatch through `_snap_indices` keeps the OKLab vs
        # CIEDE2000 fork in one place. Pre-snap chroma boost is
        # honoured only on the OKLab path — see helper docstring.
        idx = _snap_indices(
            cells.reshape(-1, 3),
            palette_oklab_arr,
            palette_rgb_arr,
            pre_snap_chroma_scale,
            distance_metric,
        )
        return palette_rgb_arr[idx].reshape(shape)

    if dither_mode == "texture":
        # First snap to nearest chip (same path as `"none"`), then run
        # the blue-noise neighbour-invasion. Strength is the invasion
        # probability scalar — `apply_neighbor_invasion` no-ops for
        # `strength <= 0`.
        idx = _snap_indices(
            cells.reshape(-1, 3),
            palette_oklab_arr,
            palette_rgb_arr,
            pre_snap_chroma_scale,
            distance_metric,
        )
        snapped = palette_rgb_arr[idx].reshape(shape)
        if dither_strength <= 0:
            return snapped
        return apply_neighbor_invasion(snapped, palette_rgb_arr, dither_strength)

    # KY / FS — always OKLab. Boost applied up-front into the cells'
    # OKLab so the dither algorithm sees the boosted means.
    cells_oklab_flat = rgb255_to_oklab(cells.reshape(-1, 3))
    if pre_snap_chroma_scale != 1.0:
        cells_oklab_flat = adjust_oklab(cells_oklab_flat, chroma_scale=pre_snap_chroma_scale)

    if dither_mode == "knoll_yliluoma":
        cells_oklab_2d = cells_oklab_flat.reshape(shape[0], shape[1], 3)
        idx = _ky_dither_indices(
            cells_oklab_2d, palette_oklab_arr, _strength_to_ky_n(dither_strength)
        ).ravel()
    else:  # "floyd_steinberg"
        cells_oklab_2d = cells_oklab_flat.reshape(shape[0], shape[1], 3)
        idx = floyd_steinberg_dither(cells_oklab_2d, palette_oklab_arr).ravel()

    return palette_rgb_arr[idx].reshape(shape)
