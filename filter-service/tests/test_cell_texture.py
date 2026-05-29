"""
Cell-texture parity test (server side). The SAME reference vectors are
asserted in the client mirror `lib/editor/trace/cell-texture.test.ts` —
if Python and TS ever diverge on the texture algorithm (or the committed
blue-noise LUT changes), one side fails here.

The fixture is a 4-chip palette + an 8×8 palette-index grid:
  - cells 0..0..0 dominate (large red island)
  - cells 1 form a small green cluster bottom-right
  - one stray blue cell at (5, 3)

Expected outputs at strength = 0, 0.6, 1.0 are hand-snapshot palette-index
matrices. Every cell that flips must flip to an INDEX in the palette (the
RGB equals the palette chip exactly).
"""
from __future__ import annotations

import numpy as np

from app.cell_texture import apply_neighbor_invasion, BLUE_NOISE_LUT

PALETTE_RGB = np.array(
    [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]], dtype=np.uint8
)

# Input palette indices (row-major, 8×8).
INPUT_IDX = np.array(
    [
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 1, 1],
        [0, 0, 0, 2, 0, 0, 1, 1],
        [0, 0, 0, 0, 0, 0, 1, 1],
        [0, 0, 0, 0, 0, 0, 1, 1],
    ],
    dtype=np.int32,
)

# Expected outputs, captured by running the Python implementation and
# snapshotting the result. The TS mirror asserts the same vectors.
EXPECTED_BY_STRENGTH: dict[float, list[int]] = {
    0.0: [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 1, 1,
        0, 0, 0, 2, 0, 0, 1, 1,
        0, 0, 0, 0, 0, 0, 1, 1,
        0, 0, 0, 0, 0, 0, 1, 1,
    ],
    0.6: [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 1, 1, 0,
        0, 0, 2, 0, 1, 0, 1, 0,
        0, 2, 2, 2, 0, 0, 1, 1,
        0, 0, 0, 2, 0, 0, 1, 1,
        0, 2, 0, 2, 1, 0, 1, 1,
        0, 2, 0, 0, 0, 0, 1, 0,
    ],
    1.0: [
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 1, 1, 1, 0,
        0, 2, 2, 2, 1, 0, 1, 0,
        0, 2, 2, 2, 0, 1, 1, 1,
        0, 2, 2, 2, 0, 1, 1, 1,
        0, 2, 0, 2, 1, 0, 1, 1,
        0, 2, 0, 2, 0, 0, 1, 0,
    ],
}


def _rgb_to_idx(rgb_arr: np.ndarray) -> np.ndarray:
    H, W = rgb_arr.shape[:2]
    out = np.zeros((H, W), dtype=np.int32)
    for cy in range(H):
        for cx in range(W):
            for k in range(len(PALETTE_RGB)):
                if (rgb_arr[cy, cx] == PALETTE_RGB[k]).all():
                    out[cy, cx] = k
                    break
            else:
                raise AssertionError(f"cell ({cy},{cx}) is not in palette: {rgb_arr[cy, cx]}")
    return out


def test_lut_loaded_and_uniform():
    """The committed LUT is 256×256 uint8 and every byte value 0..255 occurs
    exactly 256 times — sanity that we ship the right binary."""
    assert BLUE_NOISE_LUT.shape == (256, 256)
    assert BLUE_NOISE_LUT.dtype == np.uint8
    counts = np.bincount(BLUE_NOISE_LUT.ravel(), minlength=256)
    assert counts.min() == 256 and counts.max() == 256


def test_strength_zero_is_identity():
    cells = PALETTE_RGB[INPUT_IDX]
    out = apply_neighbor_invasion(cells, PALETTE_RGB, strength=0.0)
    np.testing.assert_array_equal(out, cells)
    # And output array is a fresh copy, not the same buffer.
    assert out is not cells


def test_negative_strength_is_identity():
    cells = PALETTE_RGB[INPUT_IDX]
    out = apply_neighbor_invasion(cells, PALETTE_RGB, strength=-0.5)
    np.testing.assert_array_equal(out, cells)


def test_parity_vectors_match_snapshot():
    """The exact same vectors are asserted in the TS mirror. Any divergence
    here vs. there means client and server would render different SVGs for
    the same params."""
    cells = PALETTE_RGB[INPUT_IDX]
    for strength, expected_flat in EXPECTED_BY_STRENGTH.items():
        out = apply_neighbor_invasion(cells, PALETTE_RGB, strength=strength)
        got = _rgb_to_idx(out).flatten().tolist()
        assert got == expected_flat, (
            f"strength={strength}: got {got}, expected {expected_flat}"
        )


def test_output_stays_within_palette():
    """Every output cell colour must equal one of the palette chips exactly —
    the replacement never invents a new RGB."""
    cells = PALETTE_RGB[INPUT_IDX]
    out = apply_neighbor_invasion(cells, PALETTE_RGB, strength=1.0)
    H, W = out.shape[:2]
    palette_set = {tuple(c) for c in PALETTE_RGB.tolist()}
    for cy in range(H):
        for cx in range(W):
            assert tuple(out[cy, cx]) in palette_set


def test_isolated_cell_is_not_invaded():
    """A cell with no same-colour Moore-1 neighbours has interior_score = 0,
    so its threshold check `t < strength·0³ = 0` is never satisfied — the
    blue cell at (5, 3) must survive every strength."""
    cells = PALETTE_RGB[INPUT_IDX]
    for strength in (0.25, 0.5, 0.75, 1.0):
        out = apply_neighbor_invasion(cells, PALETTE_RGB, strength=strength)
        assert tuple(out[5, 3]) == (0, 0, 255), (
            f"isolated blue cell flipped at strength={strength}: {out[5, 3]}"
        )
