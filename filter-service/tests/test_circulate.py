"""Deterministic geometry + colour of the circulate renderer (`app/circulate.py`).

The SVG viewBox must match the integer-pixel crop exactly; ellipses are drawn
directly in crop-pixel space (no `scale()` group) at the cell centres; there
are NO grid lines (the contour stroke replaces the grid); and there is one
`<g data-cell>` per cell with one ellipse (two when an inner ellipse is on).
"""
from __future__ import annotations

import re
from io import BytesIO

import numpy as np
from PIL import Image

from app.circulate import circulate_to_svg
from app.oklab import rgb255_to_oklab


def _solid_image(w: int, h: int, rgb=(10, 120, 240)) -> Image.Image:
    arr = np.empty((h, w, 3), dtype=np.uint8)
    arr[:, :] = rgb
    return Image.fromarray(arr, mode="RGB")


def test_region_count_and_group_count_are_cells_product():
    phases: list[str] = []
    svg, _png, region_count, _used = circulate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=4,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8,
        outer_w_frac=1.0, outer_h_frac=1.0,
        on_phase=phases.append,
    )
    assert region_count == 16
    assert svg.count("<g data-cell=") == 16
    # One outer ellipse per cell in the cells group + one outline ellipse
    # per cell in the always-on frames group = 32 total.
    assert svg.count("<ellipse") == 32
    # The phase hook fires for each pipeline stage.
    assert phases == ["crop", "downsample", "palette", "render", "serialize", "encode_cropped"]


def test_inner_ellipse_doubles_the_ellipse_count():
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=4,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8,
        outer_w_frac=1.0, outer_h_frac=1.0,
        inner_enabled=True, inner_w_frac=0.5, inner_h_frac=0.5,
    )
    # outer + inner per cell in the cells group + one outline ellipse per
    # cell in the always-on frames group = 3 × 16 = 48.
    assert svg.count("<ellipse") == 48
    assert svg.count("<g data-cell=") == 16


def test_viewbox_matches_integer_crop():
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(20, 12), cells_x=5, cells_y=3,
        crop_x=2, crop_y=1, crop_w=10, crop_h=6,
        outer_w_frac=1.0, outer_h_frac=1.0,
    )
    # crop is [2,12) x [1,7) -> 10 x 6 px.
    assert 'width="10" height="6"' in svg
    assert 'viewBox="0 0 10 6"' in svg


def test_no_grid_lines_and_no_scale_group():
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=4,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8,
        outer_w_frac=1.0, outer_h_frac=1.0,
    )
    # Contour replaces the grid; ellipses live in pixel space, not a scaled group.
    assert "<line" not in svg
    assert "scale(" not in svg


def test_frames_group_emits_one_outline_ellipse_per_cell():
    """The frames layer is the circulate equivalent of pixelate's grid:
    one thin outline ellipse per cell, always present, untouched by
    layer toggles. Lets users read the cell-to-number mapping even when
    the colour layer is hidden."""
    import re

    cells_x, cells_y = 5, 3
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(10, 6), cells_x=cells_x, cells_y=cells_y,
        crop_x=0, crop_y=0, crop_w=10, crop_h=6,
        outer_w_frac=0.8, outer_h_frac=0.8,
    )
    assert '<g id="frames">' in svg
    # Extract just the frames block and count its ellipses — guards against
    # a regression where the cells group's filled ellipses get mis-counted.
    frames_block = re.search(r'<g id="frames">(.*?)</g>', svg, re.DOTALL)
    assert frames_block is not None
    body = frames_block.group(1)
    assert body.count('<ellipse') == cells_x * cells_y
    assert 'fill="none"' in body
    assert 'stroke="black"' in body


def test_ellipses_centred_in_their_cell_in_pixel_space():
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(8, 8), cells_x=4, cells_y=4,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8,
        outer_w_frac=1.0, outer_h_frac=1.0,
    )
    # cell_px = 8/4 = 2; cell (0,0) centre = (1,1), radius = 1*2/2 = 1.
    assert 'cx="1.0000" cy="1.0000" rx="1.0000" ry="1.0000"' in svg
    # cell (3,3) centre = (3.5*2, 3.5*2) = (7,7).
    assert 'cx="7.0000" cy="7.0000" rx="1.0000" ry="1.0000"' in svg


def test_data_cell_attributes_cover_the_grid():
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(6, 4), cells_x=3, cells_y=2,
        crop_x=0, crop_y=0, crop_w=6, crop_h=4,
        outer_w_frac=1.0, outer_h_frac=1.0,
    )
    cells = set(re.findall(r'data-cell="(\d+,\d+)"', svg))
    assert cells == {f"{x},{y}" for y in range(2) for x in range(3)}


def test_contour_stroke_present_only_when_width_positive():
    """Scoped to the cells group only — the always-on frames group adds its
    own thin `stroke="black"` regardless of contour width, so the absence
    check has to look at the cells-group content, not the full SVG."""
    cells_block = lambda svg: re.search(r'<g id="cells">(.*?)</g>', svg, re.DOTALL).group(1)

    svg_with, _p, _n, _used = circulate_to_svg(
        _solid_image(8, 8), cells_x=2, cells_y=2,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8,
        outer_w_frac=1.0, outer_h_frac=1.0, contour_width_px=2.0,
    )
    assert 'stroke="black" stroke-width="2.0000"' in cells_block(svg_with)

    svg_without, _p, _n, _used = circulate_to_svg(
        _solid_image(8, 8), cells_x=2, cells_y=2,
        crop_x=0, crop_y=0, crop_w=8, crop_h=8,
        outer_w_frac=1.0, outer_h_frac=1.0, contour_width_px=0.0,
    )
    assert "stroke=" not in cells_block(svg_without)


def test_palette_snaps_outer_fill_to_chip_colours():
    # Mid-grey source + a black/white palette → every fill must be a chip
    # colour (#000000 or #ffffff), never the raw mean #828282.
    chips_rgb = [[0, 0, 0], [255, 255, 255]]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(4, 4, rgb=(130, 130, 130)), cells_x=2, cells_y=2,
        crop_x=0, crop_y=0, crop_w=4, crop_h=4,
        outer_w_frac=1.0, outer_h_frac=1.0,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
    )
    assert 'fill="#828282"' not in svg
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert fills <= {"#000000", "#ffffff"}


def test_inner_identity_filter_matches_outer_chip():
    chips_rgb = [[200, 0, 0], [0, 200, 0], [0, 0, 200]]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(4, 4, rgb=(200, 30, 40)), cells_x=2, cells_y=2,
        crop_x=0, crop_y=0, crop_w=4, crop_h=4,
        outer_w_frac=1.0, outer_h_frac=1.0,
        inner_enabled=True, inner_w_frac=0.5, inner_h_frac=0.5,
        inner_hue_deg=0.0, inner_lightness_delta=0.0, inner_chroma_scale=1.0,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
    )
    # Identity filter → inner snaps to the same chip as outer → a single fill.
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert fills == {"#c80000"}


def test_inner_hue_filter_lands_on_a_different_chip():
    chips_rgb = [[200, 0, 0], [0, 200, 0], [0, 0, 200]]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(4, 4, rgb=(200, 30, 40)), cells_x=2, cells_y=2,
        crop_x=0, crop_y=0, crop_w=4, crop_h=4,
        outer_w_frac=1.0, outer_h_frac=1.0,
        inner_enabled=True, inner_w_frac=0.5, inner_h_frac=0.5,
        inner_hue_deg=120.0, inner_lightness_delta=0.0, inner_chroma_scale=1.0,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
    )
    # Rotating red's hue ~+120° lands near green → inner uses a different chip.
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert "#c80000" in fills  # outer = red
    assert len(fills) >= 2  # inner snapped to a different chip
    assert fills <= {"#c80000", "#00c800", "#0000c8"}


def test_inner_darker_filter_lands_on_a_darker_chip_incl_grey():
    # Lightness shift works even on greys (the case hue rotation can't touch):
    # a mid-grey cell + a grey palette → "darker" picks a darker grey chip.
    chips_rgb = [[i, i, i] for i in range(0, 256, 16)]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(4, 4, rgb=(128, 128, 128)), cells_x=2, cells_y=2,
        crop_x=0, crop_y=0, crop_w=4, crop_h=4,
        outer_w_frac=1.0, outer_h_frac=1.0,
        inner_enabled=True, inner_w_frac=0.5, inner_h_frac=0.5,
        inner_hue_deg=0.0, inner_lightness_delta=-0.2, inner_chroma_scale=1.0,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
    )
    fills = list(re.findall(r'fill="#([0-9a-f]{2})\1\1"', svg))
    values = sorted({int(v, 16) for v in fills})
    # Two distinct grey values: the outer chip + a strictly darker inner chip.
    assert len(values) == 2
    assert values[0] < values[1]


def test_inner_without_palette_uses_raw_means():
    # No palette → both outer and inner fall back to the raw cell mean (no
    # snap, no adjustment). A solid source yields a single fill.
    svg, _png, _n, _used = circulate_to_svg(
        _solid_image(4, 4, rgb=(10, 120, 240)), cells_x=2, cells_y=2,
        crop_x=0, crop_y=0, crop_w=4, crop_h=4,
        outer_w_frac=1.0, outer_h_frac=1.0,
        inner_enabled=True, inner_w_frac=0.5, inner_h_frac=0.5,
        inner_hue_deg=90.0, inner_lightness_delta=-0.2, inner_chroma_scale=1.0,
    )
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert fills == {"#0a78f0"}


def test_crop_clamps_to_image_bounds():
    _svg, png, _n, _used = circulate_to_svg(
        _solid_image(8, 8), cells_x=2, cells_y=2,
        crop_x=-4, crop_y=-4, crop_w=100, crop_h=100,
        outer_w_frac=1.0, outer_h_frac=1.0,
    )
    assert Image.open(BytesIO(png)).size == (8, 8)


def test_num_colors_caps_circulate_output_chip_count():
    """Same top-N reduction contract as pixelate: the outer ellipse chip
    set is capped at `num_colors`; `palette_indices_used` honours the
    cap. Inner ellipses are decorative and excluded from the metric."""
    from app.circulate import circulate_cells_to_svg

    chips_rgb = [
        [200, 0, 0],    # red
        [0, 200, 0],    # green
        [0, 0, 200],    # blue
        [200, 200, 0],  # yellow
        [200, 0, 200],  # magenta
    ]
    chips_oklab = rgb255_to_oklab(np.array(chips_rgb)).tolist()
    cells = np.array([[[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0], [200, 0, 200]]], dtype=np.uint8)
    svg, _region, used = circulate_cells_to_svg(
        cell_means=cells, cropped_w_px=50, cropped_h_px=10,
        outer_w_frac=1.0, outer_h_frac=1.0,
        palette_oklab=chips_oklab, palette_rgb=chips_rgb,
        num_colors=3,
    )
    assert len(used) <= 3, f"palette_indices_used should be ≤ 3, got {used}"
    # Outer ellipse fills sit on `<ellipse ... fill="#XXXXXX">` elements;
    # there is no inner since `inner_enabled` defaults to False.
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert len(fills) <= 3, f"distinct fills in SVG should be ≤ 3, got {fills}"
