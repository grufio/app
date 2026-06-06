"""
Floyd-Steinberg error-diffusion dithering — server side.

Classical scan-order error diffusion per Floyd & Steinberg (1976), "An
Adaptive Algorithm for Spatial Greyscale" (Proc SID 17/2). Each cell is
quantised to its nearest palette chip, the residual error
(`cell_color − chip_color`) is split across four unprocessed
neighbours by the Floyd-Steinberg kernel:

      ·   ·   ·
      ·   X   7/16
      3/16  5/16  1/16   (rows go top-to-bottom; X = current cell)

Adjacent cells accumulate residual error from already-processed
cells, so a uniform-target region renders as a mix of palette chips
whose average matches the target (the spatial-quantization property
classical "single-snap" misses).

Companion to PR-D's Knoll-Yliluoma dithering — different aesthetic
(FS has "worm" patterns along the scan direction; KY has blue-noise
spatial mix), same scope. PR-F's `dither_mode` schema field picks
between them at wire-up time.

Distance metric is squared-Euclidean over the palette's space; the
error is propagated in the SAME space so the metric stays self-
consistent. Callers choose the space (OKLab from `oklab.py`, CIE Lab
from `ciede2000.py`, or any other linear-ish space).

A `lib/editor/trace/floyd-steinberg.ts` mirror runs in the client
preview; parity is asserted by the same constructed test cases.

This module is purely additive — no caller wires it into the trace
pipeline yet. PR-F integrates FS as the alternative `dither_mode`
option.
"""
from __future__ import annotations

import numpy as np


def floyd_steinberg_dither(
    cells_color: np.ndarray,
    palette_color: np.ndarray,
) -> np.ndarray:
    """Quantise an (H, W, D) cell grid to a palette by Floyd-Steinberg
    error diffusion. Returns (H, W) int64 palette indices.

    The cell-mean colours are assumed to be in the same perceptual
    space as the palette (typically OKLab or CIE Lab). The residual
    error is propagated in that same space — propagating in sRGB while
    snapping in OKLab would smear hue.

    Args:
      cells_color:    (H, W, D) cell means; D matches the palette's
                      feature dim. Float input is recommended (uint
                      arrays are converted to float64 to avoid
                      integer-overflow on accumulated error).
      palette_color:  (M, D) palette in the same space.

    Returns:
      (H, W) int64 array of palette indices. The caller maps indices
      to RGB via the palette's RGB column (kept separate so this
      function stays colour-space agnostic).

    Notes:
      - Scan order: top-to-bottom, left-to-right (classical FS, not
        serpentine). Serpentine alternation would reduce the "worm"
        pattern direction bias but is left for follow-up — for
        cell-scale (mm) output the artifact is less prominent than
        on pixel-scale image dithering.
      - Boundaries: errors that would propagate off the grid edge are
        discarded. The classical algorithm does the same.
      - A 1-cell input degenerates to plain nearest-neighbour snap
        (no neighbours to receive error). Verified by test.
    """
    if cells_color.ndim != 3:
        raise ValueError(f"cells_color must be 3-D (H, W, D); got shape {cells_color.shape}")
    if palette_color.ndim != 2:
        raise ValueError(f"palette_color must be 2-D (M, D); got shape {palette_color.shape}")
    if cells_color.shape[2] != palette_color.shape[1]:
        raise ValueError(
            f"feature dim mismatch: cells D={cells_color.shape[2]}, palette D={palette_color.shape[1]}"
        )

    H, W, _ = cells_color.shape
    work = cells_color.astype(np.float64).copy()
    palette = palette_color.astype(np.float64)
    indices = np.empty((H, W), dtype=np.int64)

    for y in range(H):
        for x in range(W):
            cell = work[y, x]
            # Nearest palette chip by squared-Euclidean distance.
            d2 = ((palette - cell) ** 2).sum(axis=1)
            idx = int(np.argmin(d2))
            indices[y, x] = idx
            error = cell - palette[idx]

            # Distribute to unprocessed neighbours per the Floyd-Steinberg
            # kernel. Each branch tests grid-boundary inclusion before
            # accumulating — out-of-bounds error is dropped (classical FS).
            if x + 1 < W:
                work[y, x + 1] += error * (7.0 / 16.0)
            if y + 1 < H:
                if x > 0:
                    work[y + 1, x - 1] += error * (3.0 / 16.0)
                work[y + 1, x] += error * (5.0 / 16.0)
                if x + 1 < W:
                    work[y + 1, x + 1] += error * (1.0 / 16.0)

    return indices
