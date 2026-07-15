"""
PR-I dispatch contract: `restrict_palette_pam` selects the right
medoid chips, the pipeline integration translates restricted indices
back to original palette positions, and the dispatch degrades
cleanly when the field is absent.

Sister tests live in `lib/editor/trace/palette-restriction.test.ts`
once the TS dispatch lands.
"""
import numpy as np

from app.oklab import rgb255_to_oklab
from app.palette_reduction import (
    reduce_to_top_n,
    restrict_palette_pam,
    select_paints,
    translate_palette_indices,
)


def _palette(rgbs: list[list[int]]):
    rgb = np.array(rgbs, dtype=np.uint8)
    return rgb255_to_oklab(rgb), rgb


# --- select_paints (shared by pixelate/circulate/linerate) --------------------------


def _pixels(rgbs: list[list[int]]):
    """(okf_flat, rgb_flat) for a flat list of pixel RGBs."""
    rgb = np.array(rgbs, dtype=np.uint8)
    return rgb255_to_oklab(rgb), rgb


def test_select_paints_returns_full_palette_indices_top_n():
    # An image using only 3 of the 5 chips, budget 2 → keep the 2 most-used;
    # sel_pal_index must be positions in the FULL palette (not 0..k-1).
    palette_oklab, palette_rgb = _palette(
        [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]]
    )
    okf, rgb = _pixels([[255, 0, 0]] * 5 + [[0, 255, 0]] * 3 + [[0, 0, 255]] * 1)
    sel_ok, sel_rgb, sel_pal_index = select_paints(
        okf, rgb, 2, palette_oklab, palette_rgb, "top_n", seed=0
    )
    assert len(sel_ok) <= 2 and len(sel_rgb) == len(sel_ok) == len(sel_pal_index)
    assert set(int(i) for i in sel_pal_index) <= {2, 3, 4}  # red/green/blue chip indices
    # the sel arrays are real palette rows at those indices
    for i, full in enumerate(sel_pal_index):
        np.testing.assert_array_equal(sel_rgb[i], palette_rgb[int(full)])


def test_select_paints_pam_returns_full_palette_indices():
    palette_oklab, palette_rgb = _palette(
        [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]]
    )
    okf, rgb = _pixels([[255, 0, 0]] * 4 + [[0, 0, 255]] * 4)
    sel_ok, sel_rgb, sel_pal_index = select_paints(
        okf, rgb, 2, palette_oklab, palette_rgb, "pam", seed=0
    )
    assert len(sel_pal_index) == 2
    assert all(0 <= int(i) < len(palette_rgb) for i in sel_pal_index)
    for i, full in enumerate(sel_pal_index):
        np.testing.assert_array_equal(sel_rgb[i], palette_rgb[int(full)])


def test_top_n_default_is_byte_identical_to_pre_feature():
    """`palette_restriction` field default flows the legacy path —
    persisted rows without the field must re-apply unchanged. Verifies
    `reduce_to_top_n` still does the count-based reduction (separate
    code path from PAM)."""
    palette_oklab, palette_rgb = _palette(
        [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]]
    )
    # Constructed post-snap grid using all 5 chips equally → no
    # reduction triggered (5 distinct == num_colors).
    cells = np.zeros((5, 5, 3), dtype=np.uint8)
    for i in range(5):
        cells[i, :] = palette_rgb[i]
    out, did = reduce_to_top_n(cells, palette_oklab, palette_rgb, 5)
    assert not did
    np.testing.assert_array_equal(out, cells)


def test_pam_no_op_when_num_colors_ge_palette_size():
    """`num_colors >= len(palette)` should short-circuit to the full
    palette + identity index map. No PAM run, no surprise."""
    palette_oklab, palette_rgb = _palette([[0, 0, 0], [128, 128, 128], [255, 255, 255]])
    cells = np.full((4, 4, 3), 100, dtype=np.uint8)
    out_oklab, out_rgb, kept = restrict_palette_pam(cells, palette_oklab, palette_rgb, 3)
    np.testing.assert_array_equal(out_rgb, palette_rgb)
    np.testing.assert_array_equal(kept, np.arange(3))
    # Also the >= case:
    out_oklab, out_rgb, kept = restrict_palette_pam(cells, palette_oklab, palette_rgb, 10)
    np.testing.assert_array_equal(out_rgb, palette_rgb)


def test_pam_no_op_when_num_colors_is_none_or_nonpositive():
    """`num_colors` None / 0 / -1 → no restriction, identity index map.
    Mirrors `reduce_to_top_n`'s no-op semantics."""
    palette_oklab, palette_rgb = _palette([[0, 0, 0], [128, 128, 128], [255, 255, 255]])
    cells = np.full((4, 4, 3), 100, dtype=np.uint8)
    for bad in (None, 0, -5):
        _, out_rgb, kept = restrict_palette_pam(cells, palette_oklab, palette_rgb, bad)
        np.testing.assert_array_equal(out_rgb, palette_rgb)
        np.testing.assert_array_equal(kept, np.arange(3))


def test_pam_picks_one_medoid_per_cluster_in_constructed_input():
    """5-chip palette spanning 3 distinct OKLab clusters (warm reds,
    cool blues, mid grays). Cell distribution drawn proportionally from
    each cluster. With `num_colors=3`, PAM must pick one representative
    per cluster — Top-N would just keep the 3 most-frequent chips,
    potentially dropping a small cluster entirely.

    The exact medoid index per cluster depends on PAM's weighted cost,
    but every output must:
      - have len 3
      - contain at least one chip from each cluster (verified by
        cluster membership lookup)
    """
    # Palette chips (RGB) grouped by cluster intent:
    # cluster A — warm reds:    idx 0, 1
    # cluster B — cool blues:   idx 2, 3
    # cluster C — mid grays:    idx 4
    palette_oklab, palette_rgb = _palette(
        [[200, 30, 30], [220, 50, 50], [30, 30, 200], [50, 50, 220], [128, 128, 128]]
    )
    cluster_of = {0: "A", 1: "A", 2: "B", 3: "B", 4: "C"}

    # Cell grid that has cells from each cluster — 16 reds, 16 blues, 4 grays.
    # Choosing exact palette chips so the histogram is unambiguous.
    cells = np.zeros((6, 6, 3), dtype=np.uint8)
    cells[0:4, 0:4] = palette_rgb[0]  # 16 warm-red cells
    cells[0:4, 4:6] = palette_rgb[2]  # 8 cool-blue cells
    cells[4:6, 0:4] = palette_rgb[3]  # 8 cool-blue cells (same cluster B)
    cells[4:6, 4:6] = palette_rgb[4]  # 4 mid-gray cells

    _, _, kept = restrict_palette_pam(cells, palette_oklab, palette_rgb, num_colors=3)
    assert len(kept) == 3
    clusters_picked = {cluster_of[int(i)] for i in kept}
    assert clusters_picked == {"A", "B", "C"}, f"Got clusters {clusters_picked}"


def test_pam_weighted_histogram_skews_to_dominant_cells():
    """When one cluster massively dominates the histogram, PAM with
    `num_colors=1` picks a chip from THAT cluster — weighted by the
    frequency vector. Verifies the weight is passed through and not
    silently dropped."""
    palette_oklab, palette_rgb = _palette(
        [[255, 0, 0], [0, 255, 0], [0, 0, 255]]
    )
    cells = np.zeros((4, 4, 3), dtype=np.uint8)
    cells[:] = palette_rgb[0]  # 16 red cells
    cells[0, 0] = palette_rgb[1]  # one green cell
    _, _, kept = restrict_palette_pam(cells, palette_oklab, palette_rgb, 1)
    assert int(kept[0]) == 0  # red wins


def test_pam_with_ciede2000_metric_does_not_crash():
    """PR-H × PR-I orthogonality: PAM with `distance_metric="ciede2000"`
    builds the distance matrix in CIE Lab D65 + ΔE00. Verifies the
    cross-path doesn't throw and returns a valid medoid set."""
    palette_oklab, palette_rgb = _palette(
        [[200, 30, 30], [30, 30, 200], [128, 128, 128]]
    )
    cells = np.zeros((4, 4, 3), dtype=np.uint8)
    cells[0:2] = palette_rgb[0]
    cells[2:4] = palette_rgb[1]
    _, _, kept = restrict_palette_pam(
        cells, palette_oklab, palette_rgb, 2, distance_metric="ciede2000"
    )
    assert len(kept) == 2
    assert set(int(i) for i in kept).issubset({0, 1, 2})


def test_pam_rejects_unknown_distance_metric():
    palette_oklab, palette_rgb = _palette([[0, 0, 0], [255, 255, 255]])
    cells = np.full((2, 2, 3), 128, dtype=np.uint8)
    try:
        restrict_palette_pam(cells, palette_oklab, palette_rgb, 1, distance_metric="bayer")
    except ValueError:
        return
    raise AssertionError("unknown distance_metric should raise")


def test_translate_palette_indices_round_trips_through_kept():
    """`translate_palette_indices(idx_in_restricted, kept)` must be
    equivalent to `kept[idx_in_restricted]`. This is the wire-contract
    helper that ships paint-by-numbers labels with ORIGINAL palette
    indices."""
    kept = np.array([2, 5, 11], dtype=np.int64)
    restricted = np.array([[0, 1], [2, 0]], dtype=np.int64)
    out = translate_palette_indices(restricted, kept)
    np.testing.assert_array_equal(out, np.array([[2, 5], [11, 2]]))


def test_pam_palette_indices_used_translates_to_original_indices():
    """End-to-end wire contract: when PAM restricts the palette pre-
    snap, the pipeline's `palette_indices_used` must carry ORIGINAL
    palette indices (paint-by-numbers labels match on those) NOT
    restricted-array positions 0..k-1.

    Smoke through `pixelate_cells_to_svg` with a known PAM result:
    construct a fixture where PAM must pick chips at original indices
    {0, 4, 7} (say), confirm the SVG-returned `palette_indices_used`
    contains those original indices, not {0, 1, 2}.
    """
    from app.pixelate import pixelate_cells_to_svg

    # 8 chips so PAM has room to skip indices.
    palette_oklab, palette_rgb = _palette(
        [
            [0, 0, 0],          # 0 — black
            [50, 50, 50],       # 1
            [128, 128, 128],    # 2
            [200, 200, 200],    # 3
            [255, 0, 0],        # 4 — red
            [255, 100, 100],    # 5
            [0, 255, 0],        # 6
            [0, 0, 255],        # 7 — blue
        ]
    )
    # Cells that pull medoids to indices {0, 4, 7} (high frequency).
    cells = np.zeros((6, 6, 3), dtype=np.uint8)
    cells[0:2] = palette_rgb[0]  # black cluster
    cells[2:4] = palette_rgb[4]  # red cluster
    cells[4:6] = palette_rgb[7]  # blue cluster

    _, _, indices_used = pixelate_cells_to_svg(
        cell_means=cells,
        cropped_w_px=24,
        cropped_h_px=24,
        palette_oklab=palette_oklab.tolist(),
        palette_rgb=palette_rgb.tolist(),
        num_colors=3,
        palette_restriction="pam",
    )
    # PR-I contract: every emitted index must be from the ORIGINAL
    # palette range (0..7), and the specific chips picked for the
    # constructed clusters should be {0, 4, 7}.
    assert set(indices_used).issubset(set(range(8)))
    assert set(indices_used) == {0, 4, 7}, (
        f"`palette_indices_used` must carry ORIGINAL indices, got {indices_used}"
    )
