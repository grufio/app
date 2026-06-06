"""
Knoll-Yliluoma parity test (server side). The SAME constructed test
cases are asserted in the client mirror
`lib/editor/trace/knoll-yliluoma.test.ts` — algorithmic drift fails
on both sides.

Reference: Joel Yliluoma (2014), "Joel Yliluoma's arbitrary-palette
positional dithering algorithm."
"""
import numpy as np

from app.knoll_yliluoma import (
    BLUE_NOISE_LUT,
    candidates_sorted_by_axis,
    knoll_yliluoma_candidates,
    threshold_bin,
)


def test_kyc_identity_when_target_is_a_palette_chip():
    """Target == palette chip → every candidate is that chip.

    The residual target at every step coincides with the chip itself
    (sum_prev / i averages back to chip × multiplicity), so argmin
    keeps picking it. This is the "no dithering" case: a cell that
    already snaps cleanly to one chip stays that one chip across all
    threshold bins → the output looks identical to plain snap.
    """
    palette = np.array([[0.0, 0.0, 0.0], [0.5, 0.0, 0.0], [1.0, 0.0, 0.0]])
    target = palette[1]
    for N in (1, 2, 4, 8):
        candidates = knoll_yliluoma_candidates(target, palette, N)
        assert candidates.tolist() == [1] * N


def test_kyc_two_color_palette_dithers_midgray_to_alternating_picks():
    """Palette = (black, white), target = mid-gray → candidates split.

    Step-by-step:
      i=1: residual = 0.5, palette 0 (0) and 1 (1) are equidistant
           — argmin picks the lowest index, so 0 (black).
      i=2: residual = 1.0 - 0 = 1.0 → palette 1 (white).
      i=3: running mean = (0+1+c)/3 = 0.5 → c = 0.5; nearest is 0
           (tie with 1, lowest wins). Pick 0.
      i=4: residual = 2 - 1 = 1.0 → white.
    For N=4 the sequence is [0, 1, 0, 1] (alternating) — the
    running mean equals 0.5 exactly after each pair.
    """
    palette = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0]])
    target = np.array([0.5, 0.0, 0.0])
    assert knoll_yliluoma_candidates(target, palette, 1).tolist() == [0]
    assert knoll_yliluoma_candidates(target, palette, 2).tolist() == [0, 1]
    assert knoll_yliluoma_candidates(target, palette, 4).tolist() == [0, 1, 0, 1]
    assert knoll_yliluoma_candidates(target, palette, 8).tolist() == [0, 1, 0, 1, 0, 1, 0, 1]


def test_kyc_running_mean_converges_to_target():
    """For a generic target, the running mean of the picked palette
    chips converges toward `target` (RMSE shrinks as N grows).

    Construct a uniform 5-chip palette on [0, 1] and pick candidates
    for an off-grid target 0.37. The mean at N=8 should be much
    closer to 0.37 than at N=1 (plain snap).
    """
    palette = np.linspace(0, 1, 5).reshape(-1, 1)
    target = np.array([0.37])
    err = {}
    for N in (1, 2, 4, 8, 16):
        candidates = knoll_yliluoma_candidates(target, palette, N)
        running_mean = palette[candidates].mean(axis=0)
        err[N] = float(np.abs(running_mean - target).sum())
    # N=1: snaps to 0.25 (nearest of 0, 0.25, 0.5, 0.75, 1.0).
    assert err[1] >= 0.10
    # N=8: running mean should be within 0.05 of target.
    assert err[8] <= 0.05
    # Monotone-non-increasing in N (more candidates can't make it worse).
    assert err[2] <= err[1] + 1e-9
    assert err[4] <= err[2] + 1e-9
    assert err[8] <= err[4] + 1e-9


def test_kyc_first_candidate_equals_nearest_neighbour():
    """The first pick (i=1) collapses to plain nearest-neighbour.

    Verifies the algorithm reduces correctly at N=1 — important
    because it means switching the trace pipeline to dithering with
    N=1 produces byte-identical output to the existing snap. Lets
    "no dithering" be a real option in the same code path.
    """
    rng = np.random.default_rng(seed=42)
    palette = rng.uniform(size=(20, 3))
    for _ in range(10):
        target = rng.uniform(size=3)
        ky = int(knoll_yliluoma_candidates(target, palette, 1)[0])
        nearest = int(np.argmin(((palette - target) ** 2).sum(axis=1)))
        assert ky == nearest


def test_kyc_rejects_invalid_inputs():
    palette = np.zeros((3, 3))
    target = np.zeros(3)
    for bad_N in (0, -1):
        try:
            knoll_yliluoma_candidates(target, palette, bad_N)
        except ValueError:
            continue
        raise AssertionError(f"pattern_size={bad_N} should raise")
    try:
        knoll_yliluoma_candidates(np.zeros(2), palette, 4)
    except ValueError:
        return
    raise AssertionError("mismatched dims should raise")


def test_threshold_bin_partitions_lut_range_evenly():
    """Bin index = `lut[y, x] * N // 256`. Verifies the integer math
    matches the LUT range: bin ∈ [0, N) for every LUT entry.
    """
    for N in (2, 4, 8, 16, 32):
        for x in range(0, 256, 17):
            for y in range(0, 256, 19):
                bin_idx = threshold_bin(x, y, N)
                assert 0 <= bin_idx < N


def test_threshold_bin_uses_lut_values_consistently():
    """A custom small LUT lets us check bin math without depending on
    the committed blue-noise binary. Constructed 4×4 LUT with values
    0, 64, 128, 192 → bins for N=4 are 0, 1, 2, 3 (one per quartile).
    """
    lut = np.array(
        [
            [0, 64, 128, 192],
            [0, 64, 128, 192],
            [0, 64, 128, 192],
            [0, 64, 128, 192],
        ],
        dtype=np.uint8,
    )
    # Tile the small LUT into a 256×256 view by repetition so the
    # function's `% 256` works on the wider grid.
    big_lut = np.tile(lut, (64, 64))
    assert big_lut.shape == (256, 256)
    for x_val, expected_bin in ((0, 0), (1, 1), (2, 2), (3, 3)):
        assert threshold_bin(x_val, 0, 4, big_lut) == expected_bin


def test_threshold_bin_wraps_position_modulo_256():
    """Positions outside the LUT must wrap with `% 256` so the same
    (x, y) lands on the same bin regardless of image size — verified
    by checking the actual committed LUT at (x, x+256, x+512).
    """
    for N in (2, 4, 8):
        for x in (5, 67, 199):
            for y in (3, 91, 222):
                base = threshold_bin(x, y, N)
                assert threshold_bin(x + 256, y, N) == base
                assert threshold_bin(x, y + 256, N) == base
                assert threshold_bin(x + 256, y + 256, N) == base


def test_candidates_sorted_by_axis_is_stable_and_uses_correct_key():
    """Sort by palette[axis] ascending, stable for ties.

    Constructed palette: index 0 has L=0.5, index 1 has L=0.2, index
    2 has L=0.5, index 3 has L=0.8. Sorted ascending: [1, 0, 2, 3]
    — index 0 and 2 tie at L=0.5; stable sort keeps insertion order
    (0 before 2).
    """
    palette = np.array(
        [[0.5, 0.0, 0.0], [0.2, 0.0, 0.0], [0.5, 0.0, 0.0], [0.8, 0.0, 0.0]]
    )
    candidates = np.array([0, 1, 2, 3])
    out = candidates_sorted_by_axis(candidates, palette, axis=0)
    assert out.tolist() == [1, 0, 2, 3]


def test_kyc_is_deterministic():
    """Same inputs → byte-identical outputs across repeated calls."""
    rng = np.random.default_rng(seed=123)
    palette = rng.uniform(size=(50, 3))
    target = rng.uniform(size=3)
    first = knoll_yliluoma_candidates(target, palette, 8).tolist()
    for _ in range(5):
        assert knoll_yliluoma_candidates(target, palette, 8).tolist() == first


def test_blue_noise_lut_loaded_and_sane():
    """LUT loaded at import, 256×256, covers the full uint8 range.

    Pins down the binary so a corrupted LUT would surface here before
    affecting visual output. The void-and-cluster property of the LUT
    isn't validated here — that's `cell_texture` responsibility.
    """
    assert BLUE_NOISE_LUT.shape == (256, 256)
    assert BLUE_NOISE_LUT.dtype == np.uint8
    # Every uint8 value should appear at least once in a 65k-cell
    # blue-noise LUT (it's a uniform distribution by construction).
    unique = np.unique(BLUE_NOISE_LUT)
    assert unique.min() == 0 and unique.max() == 255
