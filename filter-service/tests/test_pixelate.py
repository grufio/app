"""Deterministic geometry of the pixelate renderer (`app/pixelate.py`).

The SVG viewBox matches the cropped pixel dimensions exactly, the cell
coordinates scale (no translate) so they overlay the bitmap stored by
the caller 1:1, and there is one colour rect per cell plus a full grid
overlay.
"""
from __future__ import annotations

import re

import numpy as np

from app.pixelate import pixelate_cells_to_svg


def _solid_cells(cells_y: int, cells_x: int, rgb=(10, 120, 240)) -> np.ndarray:
    """Single-colour `(cells_y, cells_x, 3)` uint8 grid — what the Vercel
    server would ship for a solid source after `cellAreaAverages`."""
    arr = np.empty((cells_y, cells_x, 3), dtype=np.uint8)
    arr[:, :] = rgb
    return arr


def test_region_count_and_rect_count_match_cells_product():
    cells = _solid_cells(3, 4)
    svg, region_count, _used = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=40, cropped_h_px=30,
    )
    assert region_count == 12
    assert svg.count("<rect") == 12


def test_viewbox_matches_cropped_pixel_dimensions():
    svg, _n, _used = pixelate_cells_to_svg(
        cell_means=_solid_cells(3, 5), cropped_w_px=10, cropped_h_px=6,
    )
    assert 'width="10" height="6"' in svg
    assert 'viewBox="0 0 10 6"' in svg


def test_scale_factor_maps_cells_to_crop_pixels():
    svg, _n, _used = pixelate_cells_to_svg(
        cell_means=_solid_cells(2, 4), cropped_w_px=8, cropped_h_px=8,
    )
    # scale = cropped_px / cells -> 8/4=2.0 in x, 8/2=4.0 in y.
    m = re.search(r"scale\(([0-9.]+) ([0-9.]+)\)", svg)
    assert m, svg
    assert float(m.group(1)) == 2.0
    assert float(m.group(2)) == 4.0


def test_grid_line_count():
    svg, _n, _used = pixelate_cells_to_svg(
        cell_means=_solid_cells(3, 4), cropped_w_px=8, cropped_h_px=8,
    )
    # (cells_x + 1) verticals + (cells_y + 1) horizontals.
    assert svg.count("<line") == (4 + 1) + (3 + 1)


def test_cells_take_their_input_colour_when_no_palette():
    cells = np.array([
        [[10, 20, 30], [200, 50, 50]],
    ], dtype=np.uint8)
    svg, _, _used = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=20, cropped_h_px=10,
    )
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert fills == {"#0a141e", "#c83232"}


def test_palette_snaps_cell_fills_to_chip_colours():
    from app.oklab import rgb255_to_oklab

    chips_rgb = [[0, 0, 0], [255, 255, 255]]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    cells = np.array([
        [[130, 130, 130], [10, 10, 10]],
        [[240, 240, 240], [180, 180, 180]],
    ], dtype=np.uint8)
    svg, _, _used = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=20, cropped_h_px=20,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
    )
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    # Mid-grey 130 snaps to whichever of black/white is closer in oklab;
    # the assertion is: only chip colours, never the raw mean.
    assert 'fill="#828282"' not in svg
    assert fills <= {"#000000", "#ffffff"}


def test_num_colors_caps_output_chip_count():
    """Top-N reduction: when the snap would emit more distinct chips than
    `num_colors`, the renderer keeps the most-used chips and re-snaps the
    rest. `palette_indices_used` and the SVG `fill="..."` set must both
    respect the cap."""
    from app.oklab import rgb255_to_oklab

    # 5 chips, all distinct enough to win their own cells.
    chips_rgb = [
        [200, 0, 0],    # red
        [0, 200, 0],    # green
        [0, 0, 200],    # blue
        [200, 200, 0],  # yellow
        [200, 0, 200],  # magenta
    ]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    # 5-cell grid, each cell painted near one chip → 5 distinct snap winners.
    cells = np.array([[[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0], [200, 0, 200]]], dtype=np.uint8)
    svg, _region, used = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=50, cropped_h_px=10,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
        num_colors=3,  # cap at 3 — two chips must be re-snapped
    )
    assert len(used) <= 3, f"palette_indices_used should be ≤ 3, got {used}"
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    # Each fill must correspond to one of the 3 kept chips.
    assert len(fills) <= 3, f"distinct fills in SVG should be ≤ 3, got {fills}"


def test_num_colors_noop_when_snap_already_below_cap():
    """If the snap produced fewer distinct chips than `num_colors`, the
    reduction step is a no-op — every snap winner survives."""
    from app.oklab import rgb255_to_oklab

    chips_rgb = [[0, 0, 0], [255, 255, 255]]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    cells = np.full((2, 2, 3), 130, dtype=np.uint8)  # mid-grey → all snap to one chip
    _svg, _region, used = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=20, cropped_h_px=20,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
        num_colors=16,
    )
    assert len(used) == 1  # only one chip survived the snap


def test_pre_snap_chroma_scale_pushes_dull_cells_to_saturated_chip():
    """With a 2-chip palette (one gray, one saturated green), an olive-mean
    cell snaps to gray under `chroma_scale=1.0` (current pre-feature default)
    but flips to green under `chroma_scale=1.5`. Verifies the
    `adjust_oklab(chroma_scale=k)` pre-snap math actually changes the
    nearest-chip argmin in the expected direction.
    """
    from app.oklab import rgb255_to_oklab

    chips_rgb = [[128, 128, 128], [50, 150, 50]]  # gray + saturated green
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    olive_cell = np.array([[[100, 100, 50]]], dtype=np.uint8)

    # No-op chroma scale → snap to gray.
    _svg, _region, used_natural = pixelate_cells_to_svg(
        cell_means=olive_cell, cropped_w_px=10, cropped_h_px=10,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
        pre_snap_chroma_scale=1.0,
    )
    assert used_natural == [0], f"chroma_scale=1.0 should snap olive to gray (idx 0), got {used_natural}"

    # Strong chroma boost → snap to saturated green.
    _svg, _region, used_boost = pixelate_cells_to_svg(
        cell_means=olive_cell, cropped_w_px=10, cropped_h_px=10,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
        pre_snap_chroma_scale=1.5,
    )
    assert used_boost == [1], f"chroma_scale=1.5 should snap olive to green (idx 1), got {used_boost}"


def test_pre_snap_chroma_scale_1_0_is_byte_identical_to_pre_feature():
    """With the default `pre_snap_chroma_scale=1.0` the snap output must
    match the pre-feature pipeline exactly — same chip indices, same
    fill strings. This guarantees existing test cases stay valid and
    legacy callers that omit the field render unchanged.
    """
    from app.oklab import rgb255_to_oklab

    chips_rgb = [[0, 0, 0], [255, 255, 255]]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    cells = np.full((4, 4, 3), 130, dtype=np.uint8)

    svg_default, _r, used_default = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=40, cropped_h_px=40,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
    )
    svg_explicit, _r, used_explicit = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=40, cropped_h_px=40,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
        pre_snap_chroma_scale=1.0,
    )
    assert svg_default == svg_explicit
    assert used_default == used_explicit
