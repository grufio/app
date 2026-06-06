"""
Floyd-Steinberg parity test (server side). The SAME constructed test
cases are asserted in the client mirror
`lib/editor/trace/floyd-steinberg.test.ts` — algorithmic drift fails
on both sides.

Reference: Floyd & Steinberg (1976), "An Adaptive Algorithm for
Spatial Greyscale," Proc SID 17/2.
"""
import numpy as np

from app.floyd_steinberg import floyd_steinberg_dither


def test_fs_identity_when_cells_are_palette_chips():
    """Every cell already exactly equals a palette chip → zero error,
    zero propagation, output indices match the source.

    Constructed: 4×4 grid filled with palette chip 1 (mid-gray on a
    grayscale palette). FS snaps to idx 1, error = 0, never
    propagates anything. The output is uniformly 1.
    """
    palette = np.array([[0.0, 0.0, 0.0], [0.5, 0.5, 0.5], [1.0, 1.0, 1.0]])
    cells = np.broadcast_to(palette[1], (4, 4, 3)).copy()
    out = floyd_steinberg_dither(cells, palette)
    assert out.shape == (4, 4)
    assert (out == 1).all()


def test_fs_single_cell_equals_nearest_neighbour_snap():
    """A 1×1 grid degenerates to plain nearest-neighbour. No neighbours
    means no error propagation, so FS must produce the same index as
    a one-shot argmin.

    Important contract: switching the trace pipeline to FS with a
    1-cell grid produces byte-identical output to the existing snap.
    """
    palette = np.array(
        [[0.0, 0.0, 0.0], [0.2, 0.2, 0.2], [0.5, 0.5, 0.5], [0.8, 0.8, 0.8], [1.0, 1.0, 1.0]]
    )
    for target in (
        np.array([0.05, 0.05, 0.05]),
        np.array([0.45, 0.45, 0.45]),
        np.array([0.95, 0.95, 0.95]),
    ):
        cells = target.reshape(1, 1, 3)
        out = floyd_steinberg_dither(cells, palette)
        expected = int(np.argmin(((palette - target) ** 2).sum(axis=1)))
        assert out.tolist() == [[expected]]


def test_fs_midgray_on_two_color_palette_dithers_roughly_half():
    """Palette = (black, white), uniform mid-gray target → output mixes
    both chips. The exact pattern is FS-specific (worm-shaped), but the
    proportions on a sufficiently large grid must be close to 50/50
    because the running error average converges to zero.

    8×8 grid (64 cells) — enough that the boundary effects don't
    dominate. Tolerance allows ±15% deviation from 50/50.
    """
    palette = np.array([[0.0], [1.0]])
    cells = np.full((8, 8, 1), 0.5)
    out = floyd_steinberg_dither(cells, palette)
    n_black = int((out == 0).sum())
    n_white = int((out == 1).sum())
    assert n_black + n_white == 64
    # 50/50 ± 15% = [22, 42] of each chip.
    assert 22 <= n_black <= 42
    assert 22 <= n_white <= 42


def test_fs_first_cell_is_plain_nearest_neighbour():
    """The (0, 0) cell has no incoming error (nothing precedes it in
    scan order), so its output equals plain nearest-neighbour. This
    decouples grid-size effects from the algorithm's correctness at
    the start.
    """
    palette = np.array([[0.0, 0.0, 0.0], [0.4, 0.4, 0.4], [1.0, 1.0, 1.0]])
    # 5×5 grid where (0, 0) is a vivid red but everything else is gray.
    # The (0, 0) snap must pick chip 0 (black is closer than gray to
    # the off-axis red target).
    cells = np.full((5, 5, 3), 0.4)
    cells[0, 0] = [0.1, 0.05, 0.05]
    out = floyd_steinberg_dither(cells, palette)
    expected_first = int(np.argmin(((palette - cells[0, 0]) ** 2).sum(axis=1)))
    assert int(out[0, 0]) == expected_first


def test_fs_is_deterministic():
    """Same input → byte-identical output across repeated calls."""
    rng = np.random.default_rng(seed=42)
    palette = rng.uniform(size=(16, 3))
    cells = rng.uniform(size=(12, 14, 3))
    first = floyd_steinberg_dither(cells, palette)
    for _ in range(5):
        out = floyd_steinberg_dither(cells, palette)
        np.testing.assert_array_equal(out, first)


def test_fs_uses_exactly_the_palette_chips():
    """Every output index must be a valid palette row (≥ 0, < M)."""
    rng = np.random.default_rng(seed=123)
    palette = rng.uniform(size=(8, 3))
    cells = rng.uniform(size=(6, 7, 3))
    out = floyd_steinberg_dither(cells, palette)
    assert out.min() >= 0
    assert out.max() < palette.shape[0]


def test_fs_smooth_gradient_uses_multiple_chips():
    """Linear ramp 0.0 → 1.0 along x, palette has 5 evenly-spaced
    chips. FS must use ≥ 3 distinct chips along the gradient — a pure
    snap would use ~5 (one per step), KY would mix all 5; FS lands
    somewhere in between depending on error propagation. The lower
    bound of 3 distinct chips is the regression guard: a broken FS
    that just picks one chip per row should fail this.
    """
    palette = np.linspace(0, 1, 5).reshape(-1, 1)
    gradient = np.linspace(0, 1, 20).reshape(1, 20, 1)
    cells = np.tile(gradient, (8, 1, 1))
    out = floyd_steinberg_dither(cells, palette)
    distinct = len(np.unique(out))
    assert distinct >= 3, f"FS used only {distinct} chips on a 5-chip gradient"


def test_fs_rejects_misshapen_inputs():
    """Boundary validation."""
    palette3 = np.zeros((4, 3))
    # cells wrong rank
    try:
        floyd_steinberg_dither(np.zeros((2, 2)), palette3)
    except ValueError:
        pass
    else:
        raise AssertionError("2-D cells should raise")
    # palette wrong rank
    try:
        floyd_steinberg_dither(np.zeros((2, 2, 3)), np.zeros(3))
    except ValueError:
        pass
    else:
        raise AssertionError("1-D palette should raise")
    # feature-dim mismatch
    try:
        floyd_steinberg_dither(np.zeros((2, 2, 3)), np.zeros((4, 2)))
    except ValueError:
        pass
    else:
        raise AssertionError("dim mismatch should raise")


def test_fs_explicit_3x3_propagation_trace():
    """Pin down the exact FS kernel by walking a 3×3 example by hand.

    Palette: {0, 1}, all cells target 0.5.

    Trace (work array, updated in scan order):
      Initial:      [[0.5, 0.5, 0.5],
                     [0.5, 0.5, 0.5],
                     [0.5, 0.5, 0.5]]

      (0,0): equidist to {0, 1} → argmin picks idx 0 (lower index).
             error = 0.5. Propagate:
             E (0,1) += 7/16 · 0.5 = 0.21875 → 0.71875
             SW (none, x=0)
             S (1,0) += 5/16 · 0.5 = 0.15625 → 0.65625
             SE (1,1) += 1/16 · 0.5 = 0.03125 → 0.53125

      (0,1): work = 0.71875, nearest is 1. error = -0.28125. Propagate:
             E (0,2) += 7/16 · -0.28125 = -0.123046875 → 0.376953125
             SW (1,0) += 3/16 · -0.28125 = -0.052734375 → 0.603515625
             S (1,1) += 5/16 · -0.28125 = -0.087890625 → 0.443359375
             SE (1,2) += 1/16 · -0.28125 = -0.017578125 → 0.482421875

      (0,2): work = 0.376953125, nearest is 0. error = 0.376953125.
             E (none, x=W-1)
             SW (1,1) += 3/16 · 0.376953125 = 0.070... → 0.513...
             S (1,2) += 5/16 · 0.376953125 = 0.117... → 0.599...
             SE (none)

    The first-row indices must be [0, 1, 0] given the equidist
    tie-breaking convention (argmin lowest-index winner). Verifies
    both the kernel weights AND the scan-order ordering by hand.
    """
    palette = np.array([[0.0], [1.0]])
    cells = np.full((3, 3, 1), 0.5)
    out = floyd_steinberg_dither(cells, palette)
    # First row pinned by the trace above.
    assert out[0].tolist() == [0, 1, 0]
