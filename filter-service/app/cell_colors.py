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
