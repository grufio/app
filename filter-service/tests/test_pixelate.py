"""Deterministic geometry of the pixelate renderer (`app/pixelate.py`).

The SVG viewBox must match the integer-pixel crop exactly, the cell
coordinates scale (no translate) so they overlay the returned bitmap
1:1, and there is one colour rect per cell plus a full grid overlay.
"""
from __future__ import annotations

import re

import numpy as np
from PIL import Image

from app.pixelate import pixelate_to_svg


def _solid_image(w: int, h: int, rgb=(10, 120, 240)) -> Image.Image:
    arr = np.empty((h, w, 3), dtype=np.uint8)
    arr[:, :] = rgb
    return Image.fromarray(arr, mode="RGB")


def test_region_count_is_cells_product():
    svg, png, region_count, _used = pixelate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=4,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8, stroke_width=1.0,
    )
    assert region_count == 16
    assert svg.count("<rect") == 16


def test_viewbox_matches_integer_crop():
    svg, _png, _n, _used = pixelate_to_svg(
        _solid_image(20, 12), cells_x=5, cells_y=3,
        crop_x=2, crop_y=1, crop_w=10, crop_h=6, stroke_width=1.0,
    )
    # crop is [2,12) x [1,7) -> 10 x 6 px.
    assert 'width="10" height="6"' in svg
    assert 'viewBox="0 0 10 6"' in svg


def test_scale_factor_maps_cells_to_crop_pixels():
    svg, _png, _n, _used = pixelate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=2,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8, stroke_width=1.0,
    )
    # scale = cropped_px / cells -> 8/4=2.0 in x, 8/2=4.0 in y.
    m = re.search(r"scale\(([0-9.]+) ([0-9.]+)\)", svg)
    assert m, svg
    assert float(m.group(1)) == 2.0
    assert float(m.group(2)) == 4.0


def test_grid_line_count():
    svg, _png, _n, _used = pixelate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=3,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8, stroke_width=1.0,
    )
    # (cells_x + 1) verticals + (cells_y + 1) horizontals.
    assert svg.count("<line") == (4 + 1) + (3 + 1)


def test_solid_image_cells_take_source_colour():
    svg, _png, _n, _used = pixelate_to_svg(
        _solid_image(8, 8, rgb=(10, 120, 240)), cells_x=4, cells_y=4,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8, stroke_width=1.0,
    )
    # Every cell of a solid image area-averages to the same colour.
    assert svg.count('fill="#0a78f0"') == 16


def test_crop_clamps_to_image_bounds():
    # crop_x negative and crop extends past the image -> clamped to [0, w].
    _svg, png, _n, _used = pixelate_to_svg(
        _solid_image(8, 8), cells_x=2, cells_y=2,
        crop_x=-4, crop_y=-4, crop_w=100, crop_h=100, stroke_width=1.0,
    )
    # Returned bitmap is the clamped crop == the whole 8x8 image.
    from io import BytesIO
    assert Image.open(BytesIO(png)).size == (8, 8)


def test_palette_snaps_cell_fills_to_chip_colours():
    from app.oklab import rgb255_to_oklab

    # Mid-grey source + a black/white palette → every cell fill must be a
    # chip colour (#000000 or #ffffff), never the raw mean #828282.
    chips_rgb = [[0, 0, 0], [255, 255, 255]]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    svg, _png, _n, _used = pixelate_to_svg(
        _solid_image(4, 4, rgb=(130, 130, 130)), cells_x=2, cells_y=2,
        crop_x=0, crop_y=0, crop_w=4, crop_h=4, stroke_width=1.0,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
    )
    assert 'fill="#828282"' not in svg
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert fills <= {"#000000", "#ffffff"}


# --- cells path -----------------------------------------------------------
# The new entry point: Vercel computes the per-cell area-average and ships
# the grid directly. These tests pin the small-array contract; the legacy
# path's tests above exercise the same `pixelate_cells_to_svg` core via its
# `pixelate_to_svg` wrapper, so we don't repeat every geometric assertion.

from app.pixelate import pixelate_cells_to_svg


def test_cells_path_region_count_and_viewbox():
    cells = np.full((3, 4, 3), 200, dtype=np.uint8)  # 4 cols × 3 rows, solid
    svg, region_count, _used = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=40, cropped_h_px=30,
    )
    assert region_count == 12
    assert svg.count("<rect") == 12
    assert 'viewBox="0 0 40 30"' in svg
    assert 'width="40" height="30"' in svg


def test_cells_path_uses_cell_mean_when_no_palette():
    cells = np.array([
        [[10, 20, 30], [200, 50, 50]],
    ], dtype=np.uint8)
    svg, _, _used = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=20, cropped_h_px=10,
    )
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert fills == {"#0a141e", "#c83232"}


def test_cells_path_palette_snap():
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
    assert fills <= {"#000000", "#ffffff"}


def test_cells_and_legacy_paths_produce_equivalent_svg():
    """Parity gate: feeding the same area-averaged grid through both entry
    points must emit the same colour rects + same viewBox. The legacy path
    extras (cropped PNG + 'crop'/'downsample'/'encode_cropped' phases) are
    by-products, not output drift."""
    img = _solid_image(8, 8, rgb=(60, 90, 120))
    legacy_svg, _png, _n_legacy, _used_legacy = pixelate_to_svg(
        img, cells_x=4, cells_y=4,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8, stroke_width=1.0,
    )
    # The legacy path's area-average of a solid image is the same colour;
    # feed an equivalent (cells_y, cells_x, 3) grid to the new path.
    cells = np.full((4, 4, 3), (60, 90, 120), dtype=np.uint8)
    new_svg, _n_new, _used_new = pixelate_cells_to_svg(
        cell_means=cells, cropped_w_px=8, cropped_h_px=8,
    )

    # Rects + grid lines + viewBox must match byte-for-byte.
    legacy_rects = re.findall(r'<rect[^/]*/>', legacy_svg)
    new_rects = re.findall(r'<rect[^/]*/>', new_svg)
    assert legacy_rects == new_rects
    assert re.search(r'viewBox="[^"]+"', legacy_svg).group(0) == re.search(r'viewBox="[^"]+"', new_svg).group(0)


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
