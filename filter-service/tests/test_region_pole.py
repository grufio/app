"""Gate for the bbox-local pole-of-inaccessibility (`_region_pole`).

`compose` allocated a full (hh, ww) raster per region to place its number; the
bbox-local version must be IDENTICAL to that full-grid result — the label may not
move, incl. for a frame-hugging region (the 1px zero margin must reproduce the old
`copyMakeBorder` image-edge border). This pins full-grid == bbox over centred,
edge-touching, corner and holed regions.
"""
from __future__ import annotations

import cv2
import numpy as np

from app.linerate import _region_pole


def _pole_fullgrid(loops, hh: int, ww: int):
    """The pre-optimisation full-grid pole — the reference `_region_pole` reproduces."""
    fmask = np.zeros((hh, ww), np.uint8)
    for lp in loops:
        if len(lp) < 3:
            continue
        one = np.zeros((hh, ww), np.uint8)
        cv2.fillPoly(one, [np.round(np.asarray(lp)).astype(np.int32)], 1)
        fmask ^= one
    padded = cv2.copyMakeBorder(fmask, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    dt = cv2.distanceTransform(padded, cv2.DIST_L2, 5)
    _, radius, _, (px, py) = cv2.minMaxLoc(dt)
    return px - 1, py - 1, radius


HH, WW = 200, 240
CASES = {
    "centred": [[(60, 50), (180, 50), (180, 150), (60, 150)]],
    "top_left_corner": [[(0, 0), (90, 0), (90, 90), (0, 90)]],
    "right_edge": [[(180, 20), (WW - 1, 20), (WW - 1, 180), (180, 180)]],
    "point_at_far_edge": [[(150, 30), (WW, 30), (WW, 170), (150, 170)]],  # x==WW → clipped
    "full_frame": [[(0, 0), (WW - 1, 0), (WW - 1, HH - 1), (0, HH - 1)]],
    "with_hole": [
        [(40, 30), (200, 30), (200, 170), (40, 170)],  # outer
        [(90, 70), (150, 70), (150, 130), (90, 130)],  # hole (XOR)
    ],
}


def test_region_pole_matches_full_grid():
    for name, loops in CASES.items():
        ref = _pole_fullgrid(loops, HH, WW)
        got = _region_pole(loops, HH, WW)
        assert got is not None, name
        rnx, rny, rr = ref
        gnx, gny, gr = got
        assert (gnx, gny) == (rnx, rny), f"{name}: pole {got[:2]} != full-grid {ref[:2]}"
        assert abs(gr - rr) < 1e-4, f"{name}: radius {gr} != full-grid {rr}"


def test_region_pole_none_for_degenerate():
    assert _region_pole([[(5, 5), (6, 6)]], HH, WW) is None  # <3 points → no polygon
