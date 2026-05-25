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
    svg, png, region_count = pixelate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=4,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8, stroke_width=1.0,
    )
    assert region_count == 16
    assert svg.count("<rect") == 16


def test_viewbox_matches_integer_crop():
    svg, _png, _n = pixelate_to_svg(
        _solid_image(20, 12), cells_x=5, cells_y=3,
        crop_x=2, crop_y=1, crop_w=10, crop_h=6, stroke_width=1.0,
    )
    # crop is [2,12) x [1,7) -> 10 x 6 px.
    assert 'width="10" height="6"' in svg
    assert 'viewBox="0 0 10 6"' in svg


def test_scale_factor_maps_cells_to_crop_pixels():
    svg, _png, _n = pixelate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=2,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8, stroke_width=1.0,
    )
    # scale = cropped_px / cells -> 8/4=2.0 in x, 8/2=4.0 in y.
    m = re.search(r"scale\(([0-9.]+) ([0-9.]+)\)", svg)
    assert m, svg
    assert float(m.group(1)) == 2.0
    assert float(m.group(2)) == 4.0


def test_grid_line_count():
    svg, _png, _n = pixelate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=3,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8, stroke_width=1.0,
    )
    # (cells_x + 1) verticals + (cells_y + 1) horizontals.
    assert svg.count("<line") == (4 + 1) + (3 + 1)


def test_solid_image_cells_take_source_colour():
    svg, _png, _n = pixelate_to_svg(
        _solid_image(8, 8, rgb=(10, 120, 240)), cells_x=4, cells_y=4,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8, stroke_width=1.0,
    )
    # Every cell of a solid image area-averages to the same colour.
    assert svg.count('fill="#0a78f0"') == 16


def test_crop_clamps_to_image_bounds():
    # crop_x negative and crop extends past the image -> clamped to [0, w].
    _svg, png, _n = pixelate_to_svg(
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
    svg, _png, _n = pixelate_to_svg(
        _solid_image(4, 4, rgb=(130, 130, 130)), cells_x=2, cells_y=2,
        crop_x=0, crop_y=0, crop_w=4, crop_h=4, stroke_width=1.0,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
    )
    assert 'fill="#828282"' not in svg
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert fills <= {"#000000", "#ffffff"}
    assert len(fills) >= 1
