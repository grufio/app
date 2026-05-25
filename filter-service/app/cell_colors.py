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


def compute_cell_colors(cropped: Image.Image, cells_x: int, cells_y: int) -> np.ndarray:
    """Downsample the cropped image straight to a `cells_x × cells_y` grid
    (1 cell = 1 px, area-averaged via `Image.BOX`) and return the
    `(cells_y, cells_x, 3)` uint8 RGB array of per-cell mean colours.
    """
    cell_grid = cropped.resize((cells_x, cells_y), Image.BOX)
    return np.asarray(cell_grid, dtype=np.uint8)
