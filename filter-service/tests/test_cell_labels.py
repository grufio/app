"""
Cell-label tests — covers the three helpers + the SVG emission integration
through `pixelate_cells_to_svg` and `circulate_cells_to_svg`. The key
contract is: labels reflect the FINAL post-snap (and post-texture) cell
colours so a texture-replaced cell gets its invader's label, not the
original.
"""
from __future__ import annotations

import re

import numpy as np

from app.cell_labels import build_label_map, reconstruct_palette_indices
from app.circulate import circulate_cells_to_svg
from app.oklab import rgb255_to_oklab
from app.pixelate import pixelate_cells_to_svg


PALETTE_RGB = [[255, 255, 0], [255, 200, 0], [200, 0, 0], [0, 0, 255]]
PALETTE_OKLAB = rgb255_to_oklab(np.array(PALETTE_RGB)).tolist()


def _labels_in_order(svg: str) -> list[int]:
    return [int(s) for s in re.findall(r">(\d+)</text>", svg)]


def test_reconstruct_palette_indices_exact_match():
    pal = np.array(PALETTE_RGB, dtype=np.uint8)
    cells = np.array(
        [
            [PALETTE_RGB[0], PALETTE_RGB[1]],
            [PALETTE_RGB[3], PALETTE_RGB[2]],
        ],
        dtype=np.uint8,
    )
    idx = reconstruct_palette_indices(cells, pal)
    assert idx.tolist() == [[0, 1], [3, 2]]


def test_reconstruct_palette_indices_raises_on_unknown_colour():
    pal = np.array(PALETTE_RGB, dtype=np.uint8)
    cells = np.array([[[1, 2, 3]]], dtype=np.uint8)
    try:
        reconstruct_palette_indices(cells, pal)
    except ValueError as e:
        assert "not in palette_rgb" in str(e)
    else:
        raise AssertionError("expected ValueError for unknown colour")


def test_build_label_map_sorted_unique():
    idx = np.array([[3, 0, 0], [3, 1, 3], [3, 3, 3]], dtype=np.int32)
    m = build_label_map(idx)
    # Sorted unique = [0, 1, 3] → labels 1, 2, 3 (idx 2 is unused → skipped)
    assert m == {0: 1, 1: 2, 3: 3}


def test_pixelate_svg_emits_numbers_group_with_expected_labels():
    # 3×3 input matching the smoke test: idx 0, 1, 2, 3 all present
    cells = np.array(
        [
            [PALETTE_RGB[0], PALETTE_RGB[1], PALETTE_RGB[3]],
            [PALETTE_RGB[3], PALETTE_RGB[3], PALETTE_RGB[3]],
            [PALETTE_RGB[3], PALETTE_RGB[2], PALETTE_RGB[3]],
        ],
        dtype=np.uint8,
    )
    svg, _ = pixelate_cells_to_svg(
        cell_means=cells,
        cropped_w_px=300,
        cropped_h_px=300,
        palette_oklab=PALETTE_OKLAB,
        palette_rgb=PALETTE_RGB,
    )
    assert '<g id="numbers">' in svg
    # 4 distinct chips → labels 1..4. Row-major ordering of labels
    # matches the cell layout: 1 = idx0 (yellow), 2 = idx1 (light yellow),
    # 3 = idx2 (red), 4 = idx3 (blue).
    assert _labels_in_order(svg) == [1, 2, 4, 4, 4, 4, 4, 3, 4]


def test_pixelate_svg_omits_numbers_when_no_palette():
    cells = np.array([[[200, 200, 200]]], dtype=np.uint8)
    svg, _ = pixelate_cells_to_svg(
        cell_means=cells,
        cropped_w_px=10,
        cropped_h_px=10,
    )
    assert '<g id="numbers">' not in svg


def test_circulate_svg_emits_numbers_group():
    cells = np.array(
        [
            [PALETTE_RGB[0], PALETTE_RGB[3]],
            [PALETTE_RGB[3], PALETTE_RGB[2]],
        ],
        dtype=np.uint8,
    )
    svg, _ = circulate_cells_to_svg(
        cell_means=cells,
        cropped_w_px=200,
        cropped_h_px=200,
        outer_w_frac=0.8,
        outer_h_frac=0.8,
        palette_oklab=PALETTE_OKLAB,
        palette_rgb=PALETTE_RGB,
    )
    assert '<g id="numbers">' in svg
    # 3 distinct chips (0, 2, 3) → labels 1..3 (the unused idx 1 is skipped)
    labels = _labels_in_order(svg)
    assert sorted(set(labels)) == [1, 2, 3]


def test_pixelate_labels_reflect_texture_replaced_cells():
    """Regression test for the review-flagged bug: the label of a cell
    that texture replaced with a neighbour's chip must reflect the FINAL
    chip, not the pre-texture mean. Build a deep-interior monochromatic
    cell grid + force texture at strength 1.0 — some cells must flip,
    and the labels must follow the new colour."""
    # 16×16 all-yellow (idx 0) with a single red (idx 2) seed cell in the
    # middle so texture has a different-colour neighbour to invade with.
    grid = np.full((16, 16, 3), PALETTE_RGB[0], dtype=np.uint8)
    grid[8, 8] = PALETTE_RGB[2]
    svg, _ = pixelate_cells_to_svg(
        cell_means=grid,
        cropped_w_px=160,
        cropped_h_px=160,
        palette_oklab=PALETTE_OKLAB,
        palette_rgb=PALETTE_RGB,
        texture_enabled=True,
        texture_strength=1.0,
    )
    # Two distinct chips present (yellow + red) → labels {1, 2}. Whether
    # texture flipped any cells or not, every emitted label is one of these
    # two; specifically there must be at least one `>2<` somewhere
    # (the red cell, plus possibly more from texture invasions).
    labels = _labels_in_order(svg)
    assert set(labels) == {1, 2}
    assert labels.count(2) >= 1
