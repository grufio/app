"""Unit tests for the Lineart paint-by-numbers helpers."""
from __future__ import annotations

import math
import re

import numpy as np

from app.lineart_labels import merge_tiny_regions, render_numbers_group
from app.region_geometry import path_to_polygon


def _make_path(d: str, fill: str = "#aabbcc") -> str:
    return f'<path d="{d}" fill="{fill}"/>'


def _make_path_t(d: str, tx: float, ty: float, fill: str = "#aabbcc") -> str:
    """A vtracer-shaped path: local `d` + a `translate` transform."""
    return f'<path d="{d}" fill="{fill}" transform="translate({tx} {ty})"/>'


def test_merge_tiny_regions_unions_sliver_into_neighbor():
    # Big square next to a thin sliver. The sliver's inscribed-circle
    # radius is below the threshold → must be merged.
    big = _make_path("M 0 0 L 40 0 L 40 40 L 0 40 Z", fill="#ff0000")
    sliver = _make_path("M 40 0 L 42 0 L 42 40 L 40 40 Z", fill="#00ff00")
    paths_in = [big, sliver]
    indices_in = np.array([0, 1], dtype=np.int32)

    paths_out, indices_out = merge_tiny_regions(paths_in, indices_in, min_radius=4.0)

    # Sliver gone, big absorbed it.
    assert len(paths_out) == 1
    assert len(indices_out) == 1
    assert int(indices_out[0]) == 0
    # The merged path keeps the big square's fill (red).
    assert 'fill="#ff0000"' in paths_out[0]


def test_merge_tiny_regions_bridges_hairline_gap():
    # vtracer's cutout output leaves sub-pixel gaps between adjacent
    # regions, so a plain union yields a MultiPolygon. Regression: the
    # merge must bridge the gap (dilate the tiny) instead of skipping,
    # otherwise thin regions survive un-mergeable. ~1px gap here.
    big = _make_path("M 0 0 L 40 0 L 40 40 L 0 40 Z", fill="#ff0000")
    sliver = _make_path("M 41 0 L 43 0 L 43 40 L 41 40 Z", fill="#00ff00")
    paths_out, indices_out = merge_tiny_regions(
        [big, sliver], np.array([0, 1], dtype=np.int32), min_radius=4.0
    )
    assert len(paths_out) == 1
    assert int(indices_out[0]) == 0
    assert 'fill="#ff0000"' in paths_out[0]


def test_merge_tiny_regions_merges_more_than_five_slivers():
    # Regression: the old max_iter=5 cap left most slivers un-merged on
    # real images. A strip of 8 thin slivers next to one big region must
    # all fold in (default max_iter = region count, not a hard 5).
    big = _make_path("M 0 0 L 40 0 L 40 40 L 0 40 Z", fill="#ff0000")
    slivers = [
        _make_path(f"M {40 + i * 2} 0 L {42 + i * 2} 0 L {42 + i * 2} 40 L {40 + i * 2} 40 Z")
        for i in range(8)
    ]
    paths_in = [big, *slivers]
    indices_in = np.array([0] + [1] * 8, dtype=np.int32)
    paths_out, _ = merge_tiny_regions(paths_in, indices_in, min_radius=4.0)
    # All 8 slivers absorbed → one region left (would be ≥ 4 under a 5-cap).
    assert len(paths_out) == 1


def test_merge_tiny_regions_leaves_well_sized_alone():
    # Two large squares far apart; nothing to merge.
    a = _make_path("M 0 0 L 40 0 L 40 40 L 0 40 Z")
    b = _make_path("M 100 0 L 140 0 L 140 40 L 100 40 Z")
    indices = np.array([0, 1], dtype=np.int32)

    paths_out, indices_out = merge_tiny_regions([a, b], indices, min_radius=4.0)
    assert len(paths_out) == 2
    assert list(int(i) for i in indices_out) == [0, 1]


def test_merge_tiny_regions_handles_isolated_speckle():
    # A small region with no neighbour: the loop should mark it
    # unmergeable rather than spinning forever.
    isolated = _make_path("M 0 0 L 1 0 L 1 1 L 0 1 Z")
    paths_out, indices_out = merge_tiny_regions(
        [isolated], np.array([0], dtype=np.int32), min_radius=4.0
    )
    # No merge possible — the original path is returned.
    assert len(paths_out) == 1


def test_render_numbers_group_emits_text_for_big_region():
    paths = [_make_path("M 0 0 L 100 0 L 100 100 L 0 100 Z")]
    indices = np.array([5], dtype=np.int32)
    label_map = {5: 1}
    g = render_numbers_group(paths, indices, label_map, min_radius=4.0)
    assert g.startswith('<g id="numbers">')
    assert g.endswith("</g>")
    # One <text> element with label "1".
    assert g.count("<text ") == 1
    assert ">1</text>" in g


def test_render_numbers_group_places_text_at_translated_position():
    # THE regression: vtracer paths carry `translate(...)`. The label must
    # land inside the translated region, not at the local origin (which is
    # what "all numbers piled up top-left" looked like).
    path = _make_path_t("M 0 0 L 100 0 L 100 100 L 0 100 Z", 200, 300, fill="#abcdef")
    g = render_numbers_group([path], np.array([0], dtype=np.int32), {0: 1}, min_radius=4.0)
    m = re.search(r'<text x="([-\d.]+)" y="([-\d.]+)"', g)
    assert m is not None
    x, y = float(m.group(1)), float(m.group(2))
    # World region spans [200,300]..[300,400]; centre ≈ (250, 350).
    assert 200.0 < x < 300.0
    assert 300.0 < y < 400.0


def test_merge_tiny_regions_with_translated_paths_uses_world_coords():
    # Two vtracer-shaped (translated) paths, adjacent in WORLD space:
    # big [10,10]..[50,50], sliver [50,10]..[52,50]. The merge must union
    # in world coords (not collapse both onto the origin), keep the big
    # fill, strip the now-stale transform, and emit absolute geometry.
    big = _make_path_t("M 0 0 L 40 0 L 40 40 L 0 40 Z", 10, 10, fill="#ff0000")
    sliver = _make_path_t("M 0 0 L 2 0 L 2 40 L 0 40 Z", 50, 10, fill="#00ff00")
    paths_out, indices_out = merge_tiny_regions(
        [big, sliver], np.array([0, 1], dtype=np.int32), min_radius=4.0
    )
    assert len(paths_out) == 1
    assert int(indices_out[0]) == 0
    assert 'fill="#ff0000"' in paths_out[0]
    # Absolute geometry now → the stale translate must be gone.
    assert "transform=" not in paths_out[0]
    merged_d = re.search(r'd="([^"]*)"', paths_out[0]).group(1)
    poly = path_to_polygon(merged_d, None)  # parse as-is (no transform)
    assert poly is not None
    minx, _, maxx, _ = poly.bounds
    # World extent: from big's left (10) to the sliver's right (52), NOT
    # the local ~0..42 that the pre-fix code produced.
    assert math.isclose(minx, 10.0, abs_tol=0.5)
    assert maxx > 50.0


def test_render_numbers_group_labels_every_region():
    # Every region the merge kept gets a number — even a sub-threshold
    # survivor (previously skipped, leaving a bare region). It shrinks its
    # own label to fit rather than being dropped.
    small = _make_path("M 0 0 L 1 0 L 1 1 L 0 1 Z")  # radius 0.5 < min_radius
    big = _make_path("M 0 0 L 100 0 L 100 100 L 0 100 Z")
    g = render_numbers_group(
        [small, big], np.array([1, 2], dtype=np.int32), {1: 1, 2: 2}, min_radius=4.0
    )
    assert g.count("<text ") == 2
    # The tiny region's font shrinks to fit (≤ 1.4 × its 0.5 radius).
    small_font = float(re.findall(r'font-size="([\d.]+)"', g)[0])
    assert small_font <= 0.7 + 1e-6


def test_render_numbers_group_dedup_via_label_map():
    # Two large squares with the same palette index → same label.
    paths = [
        _make_path("M 0 0 L 50 0 L 50 50 L 0 50 Z"),
        _make_path("M 100 0 L 150 0 L 150 50 L 100 50 Z"),
    ]
    indices = np.array([7, 7], dtype=np.int32)
    label_map = {7: 1}
    g = render_numbers_group(paths, indices, label_map, min_radius=4.0)
    labels = re.findall(r">(\d+)</text>", g)
    assert labels == ["1", "1"]


def test_render_numbers_group_uniform_font_across_regions():
    # Font is uniform (min(1.4 × min_radius, max_font)), NOT per-region — a
    # big and a small (but ≥ threshold) region get the SAME size.
    big_d = "M 0 0 L 100 0 L 100 100 L 0 100 Z"  # radius 50
    mid_d = "M 0 0 L 20 0 L 20 20 L 0 20 Z"  # radius 10 (≥ min_radius 8)
    paths = [_make_path(big_d), _make_path(mid_d)]
    g = render_numbers_group(paths, np.array([0, 1], dtype=np.int32), {0: 1, 1: 2}, min_radius=8.0)
    fonts = [float(f) for f in re.findall(r'font-size="([\d.]+)"', g)]
    assert len(fonts) == 2
    assert fonts[0] == fonts[1]  # uniform
    assert fonts[0] == min(1.4 * 8.0, 24.0)  # = 11.2

    # Font caps at max_font when the threshold is large.
    g2 = render_numbers_group([_make_path(big_d)], np.array([0], dtype=np.int32), {0: 1}, min_radius=100.0)
    assert float(re.search(r'font-size="([\d.]+)"', g2).group(1)) == 24.0
