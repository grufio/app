"""
PR-H dispatch contract: `map_cells_to_palette` and
`map_cells_dithered` select the snap distance metric via
`distance_metric`. Sister to `test_cell_colors_dispatch.py` (which
covers the dither-mode dispatch in PR-F).

Default `"oklab"` must be byte-identical to the legacy `oklab.py`
snap. `"ciede2000"` must (a) accept different inputs without crashing,
(b) emit only palette chips, and (c) shift the snap winner on a
constructed input where OKLab vs CIE Lab D65 disagree.
"""
import numpy as np

from app.cell_colors import map_cells_dithered, map_cells_to_palette
from app.oklab import rgb255_to_oklab


def _make_palette(rgbs: list[list[int]]):
    palette_rgb = np.array(rgbs, dtype=np.uint8)
    palette_oklab = rgb255_to_oklab(palette_rgb)
    return palette_oklab, palette_rgb


def test_distance_metric_default_is_oklab_byte_identical():
    """`distance_metric="oklab"` (default) must produce byte-identical
    output to the pre-PR-H snap on a realistic, mixed-chip input."""
    palette_oklab, palette_rgb = _make_palette(
        [
            [0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0],
            [0, 0, 255], [128, 64, 32], [200, 200, 100],
        ]
    )
    rng = np.random.default_rng(seed=13)
    cells = rng.integers(0, 256, size=(6, 9, 3), dtype=np.uint8)
    legacy = map_cells_to_palette(
        cells, palette_oklab, palette_rgb, pre_snap_chroma_scale=1.0
    )
    dispatched = map_cells_to_palette(
        cells, palette_oklab, palette_rgb,
        pre_snap_chroma_scale=1.0, distance_metric="oklab",
    )
    np.testing.assert_array_equal(legacy, dispatched)


def test_distance_metric_ciede2000_emits_only_palette_chips():
    """Every output pixel under CIEDE2000 must be exactly a palette chip
    (no leak through the OKLab → CIE Lab pipeline)."""
    palette_oklab, palette_rgb = _make_palette(
        [
            [0, 0, 0], [50, 50, 50], [128, 128, 128], [200, 200, 200],
            [255, 255, 255], [255, 0, 0], [0, 0, 255],
        ]
    )
    chip_set = {tuple(chip.tolist()) for chip in palette_rgb}
    rng = np.random.default_rng(seed=99)
    cells = rng.integers(0, 256, size=(5, 7, 3), dtype=np.uint8)
    out = map_cells_to_palette(
        cells, palette_oklab, palette_rgb,
        pre_snap_chroma_scale=1.0, distance_metric="ciede2000",
    )
    out_set = {tuple(out[y, x].tolist()) for y in range(out.shape[0]) for x in range(out.shape[1])}
    assert out_set.issubset(chip_set), (
        f"CIEDE2000 leaked non-palette colours: {out_set - chip_set}"
    )


def test_distance_metric_ciede2000_can_shift_snap_winner():
    """Constructed input where OKLab and CIEDE2000 disagree on the
    nearest chip.

    Fixture: desaturated warm target `(120, 80, 80)` against a palette
    of mid-gray, light-gray, cool-tint and warm-tint chips. OKLab
    squared-Euclidean over-weights the L difference and picks pure
    mid-gray `(100, 100, 100)`; CIEDE2000's perceptual weighting
    correctly identifies the warm-tinted chip `(150, 100, 100)` as
    closer because the residual a*/b* hue agrees with the target. The
    Sl + Sc weighting that drives this is one of CIEDE2000's
    documented correction targets (Sharma 2005, §3).
    """
    palette_oklab, palette_rgb = _make_palette(
        [[100, 100, 100], [150, 150, 150], [100, 100, 150], [150, 100, 100]]
    )
    cells = np.broadcast_to([120, 80, 80], (4, 4, 3)).astype(np.uint8).copy()
    oklab_out = map_cells_to_palette(
        cells, palette_oklab, palette_rgb,
        pre_snap_chroma_scale=1.0, distance_metric="oklab",
    )
    ciede_out = map_cells_to_palette(
        cells, palette_oklab, palette_rgb,
        pre_snap_chroma_scale=1.0, distance_metric="ciede2000",
    )
    assert oklab_out.shape == ciede_out.shape == cells.shape
    # OKLab picks the mid-gray (over-weighted L), CIEDE2000 picks the
    # warm-tinted chip (perceptually closer).
    assert tuple(oklab_out[0, 0]) == (100, 100, 100), (
        f"expected OKLab to pick mid-gray (100,100,100), got {tuple(oklab_out[0, 0])}"
    )
    assert tuple(ciede_out[0, 0]) == (150, 100, 100), (
        f"expected CIEDE2000 to pick warm chip (150,100,100), got {tuple(ciede_out[0, 0])}"
    )


def test_distance_metric_via_map_cells_dithered_none_path():
    """`map_cells_dithered` with `dither_mode="none"` must route the
    `distance_metric` through to the same snap path. Verifies the
    dispatch tree wires it correctly when dithering is off."""
    palette_oklab, palette_rgb = _make_palette(
        [[0, 0, 0], [40, 50, 200], [100, 30, 200], [255, 255, 255]]
    )
    cells = np.broadcast_to([60, 30, 200], (3, 3, 3)).astype(np.uint8).copy()
    direct = map_cells_to_palette(
        cells, palette_oklab, palette_rgb, distance_metric="ciede2000"
    )
    via_dispatch = map_cells_dithered(
        cells, palette_oklab, palette_rgb,
        pre_snap_chroma_scale=1.0,
        dither_mode="none",
        distance_metric="ciede2000",
    )
    np.testing.assert_array_equal(direct, via_dispatch)


def test_distance_metric_ignored_on_ky_dispatch():
    """When `dither_mode="knoll_yliluoma"`, `distance_metric` is
    DOCUMENTED as ignored (the algorithm's argmin is hardcoded OKLab
    squared-Euclidean). Verify that flipping the metric does NOT
    change the KY output — caught regressions where KY accidentally
    started honouring the metric would surface here."""
    palette_oklab, palette_rgb = _make_palette(
        [[0, 0, 0], [40, 50, 200], [100, 30, 200], [255, 255, 255]]
    )
    cells = np.broadcast_to([60, 30, 200], (4, 4, 3)).astype(np.uint8).copy()
    oklab_ky = map_cells_dithered(
        cells, palette_oklab, palette_rgb,
        dither_mode="knoll_yliluoma", dither_pattern_size=4,
        distance_metric="oklab",
    )
    ciede_ky = map_cells_dithered(
        cells, palette_oklab, palette_rgb,
        dither_mode="knoll_yliluoma", dither_pattern_size=4,
        distance_metric="ciede2000",
    )
    np.testing.assert_array_equal(oklab_ky, ciede_ky)


def test_distance_metric_ignored_on_fs_dispatch():
    """Same as KY: FS argmin is hardcoded OKLab squared-Euclidean."""
    palette_oklab, palette_rgb = _make_palette(
        [[0, 0, 0], [40, 50, 200], [100, 30, 200], [255, 255, 255]]
    )
    cells = np.broadcast_to([60, 30, 200], (4, 4, 3)).astype(np.uint8).copy()
    oklab_fs = map_cells_dithered(
        cells, palette_oklab, palette_rgb,
        dither_mode="floyd_steinberg", distance_metric="oklab",
    )
    ciede_fs = map_cells_dithered(
        cells, palette_oklab, palette_rgb,
        dither_mode="floyd_steinberg", distance_metric="ciede2000",
    )
    np.testing.assert_array_equal(oklab_fs, ciede_fs)


def test_distance_metric_ciede2000_suppresses_pre_snap_chroma_scale():
    """The OKLCh chroma boost is OKLab-specific (CIE LCh ≠ OKLCh).
    Under `distance_metric="ciede2000"` the boost must be SKIPPED, so
    output is byte-identical regardless of `pre_snap_chroma_scale`."""
    palette_oklab, palette_rgb = _make_palette(
        [[0, 0, 0], [180, 100, 100], [255, 0, 0], [255, 255, 255]]
    )
    cells = np.full((4, 4, 3), 150, dtype=np.uint8)
    no_boost = map_cells_to_palette(
        cells, palette_oklab, palette_rgb,
        pre_snap_chroma_scale=1.0, distance_metric="ciede2000",
    )
    with_boost = map_cells_to_palette(
        cells, palette_oklab, palette_rgb,
        pre_snap_chroma_scale=1.5, distance_metric="ciede2000",
    )
    np.testing.assert_array_equal(no_boost, with_boost)


def test_distance_metric_rejects_unknown():
    """Unknown values must raise — silent fallback would hide deploy
    drift between Vercel and the filter-service."""
    palette_oklab, palette_rgb = _make_palette([[0, 0, 0], [255, 255, 255]])
    cells = np.zeros((2, 2, 3), dtype=np.uint8)
    try:
        map_cells_dithered(
            cells, palette_oklab, palette_rgb,
            dither_mode="none", distance_metric="cie94",
        )
    except ValueError:
        return
    raise AssertionError("unknown distance_metric should raise")
