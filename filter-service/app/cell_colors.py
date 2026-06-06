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

from .floyd_steinberg import floyd_steinberg_dither
from .knoll_yliluoma import (
    BLUE_NOISE_LUT,
    candidates_sorted_by_axis,
    knoll_yliluoma_candidates,
    threshold_bin,
)
from .oklab import adjust_oklab, nearest_palette_indices, rgb255_to_oklab


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
) -> np.ndarray:
    """Snap each per-cell mean colour to the nearest palette chip.

    `cell_means` is the `(cells_y, cells_x, 3)` uint8 array from
    `compute_cell_colors`. `palette_oklab` (M, 3) and `palette_rgb` (M, 3
    uint8) are the chips of the active palette (active-tier `lab_munsell`
    + `lab_grays` appended for colour, `lab_grays` for b/w) — the OKLab
    columns straight from the DB, so the chip space matches color-lab.
    Each cell mean is converted to OKLab and replaced by the RGB of its
    nearest chip. Returns `(cells_y, cells_x, 3)` uint8.

    `pre_snap_chroma_scale` (default `1.0` = no-op = pre-feature
    behaviour) multiplies the cell mean's OKLCh chroma BEFORE the
    nearest-chip argmin. Values > 1.0 push dull-averaged cells toward
    saturated chips, spreading the picked chip-set across more of the
    palette. See `lib/editor/trace/chroma-scale-schema.ts` for the
    range + default-1.2 rationale.
    """
    shape = np.asarray(cell_means).shape
    cells_oklab = rgb255_to_oklab(np.asarray(cell_means).reshape(-1, 3))
    if pre_snap_chroma_scale != 1.0:
        cells_oklab = adjust_oklab(cells_oklab, chroma_scale=pre_snap_chroma_scale)
    idx = nearest_palette_indices(cells_oklab, palette_oklab)
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
    dither_pattern_size: int = 4,
) -> np.ndarray:
    """Snap-or-dither dispatch shared by pixelate + circulate (PR-F).

    Replaces direct calls to `map_cells_to_palette` from the pipeline
    so the same cell-mean → palette-chip step can pick between three
    behaviours via the `dither_mode` parameter:

      - `"none"`            → `map_cells_to_palette` semantics
                              (byte-identical to pre-PR-F behaviour);
                              `dither_pattern_size` is ignored.
      - `"knoll_yliluoma"`  → per-cell candidate selection +
                              blue-noise threshold pick (PR-D's
                              `knoll_yliluoma.py`); `pattern_size`
                              controls the candidate count (N).
      - `"floyd_steinberg"` → scan-order error diffusion (PR-E's
                              `floyd_steinberg.py`);
                              `dither_pattern_size` is ignored.

    All paths run in OKLab space (the `pre_snap_chroma_scale` boost
    happens once up-front) and return the same shape
    `(cells_y, cells_x, 3)` uint8 RGB array as `map_cells_to_palette`
    — callers shouldn't notice which dispatch ran.
    """
    if dither_mode not in {"none", "knoll_yliluoma", "floyd_steinberg"}:
        raise ValueError(f"unknown dither_mode: {dither_mode!r}")

    cells = np.asarray(cell_means)
    shape = cells.shape
    cells_oklab_flat = rgb255_to_oklab(cells.reshape(-1, 3))
    if pre_snap_chroma_scale != 1.0:
        cells_oklab_flat = adjust_oklab(cells_oklab_flat, chroma_scale=pre_snap_chroma_scale)
    palette_oklab_arr = np.asarray(palette_oklab, dtype=np.float64)
    palette_rgb_arr = np.asarray(palette_rgb, dtype=np.uint8)

    if dither_mode == "none":
        idx = nearest_palette_indices(cells_oklab_flat, palette_oklab_arr)
    elif dither_mode == "knoll_yliluoma":
        cells_oklab_2d = cells_oklab_flat.reshape(shape[0], shape[1], 3)
        idx = _ky_dither_indices(
            cells_oklab_2d, palette_oklab_arr, int(dither_pattern_size)
        ).ravel()
    else:  # "floyd_steinberg"
        cells_oklab_2d = cells_oklab_flat.reshape(shape[0], shape[1], 3)
        idx = floyd_steinberg_dither(cells_oklab_2d, palette_oklab_arr).ravel()

    return palette_rgb_arr[idx].reshape(shape)
