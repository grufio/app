"""Unit tests for the segmentation-based linerate pipeline."""
from __future__ import annotations

import math
import re

import numpy as np
from PIL import Image

from app.linerate import (
    build_arcs,
    smooth_arc,
    merge_small_regions,
    linerate_to_svg,
)


def test_build_arcs_shares_boundary_between_neighbours():
    # Two regions split down the middle share ONE boundary arc — that shared
    # arc is what makes the output watertight.
    labels = np.zeros((6, 6), np.int32)
    labels[:, 3:] = 1
    arcs, region_arcs = build_arcs(labels)
    # the mid seam arc must belong to BOTH regions
    shared = [i for i in region_arcs[0] if i in region_arcs[1]]
    assert shared, "adjacent regions must share a boundary arc"
    a, b = arcs[shared[0]]["labels"]
    assert {a, b} == {0, 1}


def test_smooth_arc_pins_endpoints():
    # Open arc: first + last point (junctions) must be unchanged so both
    # regions meet exactly at the junction.
    corners = [(0, 0), (0, 1), (0, 2), (1, 2), (2, 2)]
    out = smooth_arc(corners, eps=1.0, iters=3)
    assert tuple(out[0]) == (0.0, 0.0)
    assert tuple(out[-1]) == (2.0, 2.0)


def test_merge_small_regions_absorbs_sliver():
    # A 1px-wide sliver column between two big halves is below the radius
    # threshold and must be relabelled away.
    labels = np.zeros((10, 11), np.int32)
    labels[:, 5] = 1          # 1px sliver
    labels[:, 6:] = 2
    out = merge_small_regions(labels.copy(), min_radius=3.0)
    # 3 regions → 2 (the sliver folded into a neighbour; labels compacted).
    assert len(np.unique(out)) == 2
    assert out[0, 5] in (out[0, 4], out[0, 6])  # sliver took a neighbour's label


def test_linerate_to_svg_labels_every_region():
    # Simple 3-band image → each surviving region carries a number.
    arr = np.zeros((60, 60, 3), np.uint8)
    arr[:20] = (200, 60, 60)
    arr[20:40] = (60, 200, 60)
    arr[40:] = (60, 60, 200)
    img = Image.fromarray(arr, "RGB")
    svg, region_count, _ = linerate_to_svg(
        img, line_thickness=1.0, blur_amount=0, smoothness=0.6, num_colors=6, min_radius=4.0
    )
    assert '<g id="regions">' in svg and '<g id="numbers">' in svg
    assert region_count >= 3
    # every region gets a <text>
    assert svg.count("<text ") == region_count


def test_linerate_to_svg_uniform_font():
    arr = np.zeros((80, 80, 3), np.uint8)
    arr[:40] = (200, 60, 60)
    arr[40:] = (60, 60, 200)
    img = Image.fromarray(arr, "RGB")
    svg, _, _ = linerate_to_svg(img, blur_amount=0, num_colors=4, min_radius=8.0)
    fonts = [float(f) for f in re.findall(r'font-size="([\d.]+)"', svg)]
    assert fonts
    # uniform (capped/derived from min_radius, not per-region radius)
    assert max(fonts) - min(fonts) < 1e-6 or max(fonts) <= min(1.4 * 8.0, 24.0) + 1e-6


def test_linerate_to_svg_snaps_to_palette():
    arr = np.zeros((40, 40, 3), np.uint8)
    arr[:, :20] = (200, 60, 60)
    arr[:, 20:] = (60, 60, 200)
    img = Image.fromarray(arr, "RGB")
    pal_rgb = [[200, 60, 60], [60, 60, 200]]
    from app.oklab import rgb255_to_oklab
    pal_ok = [list(rgb255_to_oklab(np.array([[r, g, b]], np.uint8))[0]) for r, g, b in pal_rgb]
    svg, _, used = linerate_to_svg(
        img, blur_amount=0, num_colors=4, min_radius=4.0,
        palette_oklab=pal_ok, palette_rgb=pal_rgb,
    )
    assert len(used) >= 1
    assert 'fill="#c83c3c"' in svg or 'fill="#3c3cc8"' in svg  # a palette colour
