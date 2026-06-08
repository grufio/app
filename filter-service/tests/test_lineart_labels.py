"""Unit tests for the Lineart paint-by-numbers helpers."""
from __future__ import annotations

import re

import numpy as np

from app.lineart_labels import merge_tiny_regions, render_numbers_group


def _make_path(d: str, fill: str = "#aabbcc") -> str:
    return f'<path d="{d}" fill="{fill}"/>'


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


def test_render_numbers_group_skips_below_min_radius():
    # A 1×1 square has inscribed radius 0.5 — well below min_radius 4.
    paths = [_make_path("M 0 0 L 1 0 L 1 1 L 0 1 Z")]
    indices = np.array([5], dtype=np.int32)
    label_map = {5: 1}
    g = render_numbers_group(paths, indices, label_map, min_radius=4.0)
    assert g.count("<text ") == 0


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


def test_render_numbers_group_font_size_scales_with_radius():
    big_d = "M 0 0 L 100 0 L 100 100 L 0 100 Z"  # radius 50
    small_d = "M 0 0 L 10 0 L 10 10 L 0 10 Z"  # radius 5
    g_big = render_numbers_group(
        [_make_path(big_d)], np.array([0], dtype=np.int32), {0: 1}, min_radius=2.0
    )
    g_small = render_numbers_group(
        [_make_path(small_d)], np.array([0], dtype=np.int32), {0: 1}, min_radius=2.0
    )
    big_font = float(re.search(r'font-size="([\d.]+)"', g_big).group(1))
    small_font = float(re.search(r'font-size="([\d.]+)"', g_small).group(1))
    assert big_font > small_font
    assert big_font <= 24.0  # capped at max_font
