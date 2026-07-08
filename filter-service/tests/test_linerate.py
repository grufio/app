"""Unit tests for the perceptual (P³) linerate pipeline."""
from __future__ import annotations

import re

import numpy as np
import pytest
from PIL import Image

from app.linerate import (
    build_arcs,
    smooth_arc,
    linerate_to_svg,
    _dissolve,
    _labels_from_paint_map,
)
from app.oklab import rgb255_to_oklab


def _mini_palette(rgbs):
    """(oklab list, rgb list) for a handful of RGB triples — a fixed test palette."""
    pal_rgb = [list(c) for c in rgbs]
    pal_ok = [list(rgb255_to_oklab(np.array([c], np.uint8))[0]) for c in rgbs]
    return pal_ok, pal_rgb


# ---- watertight back half (unchanged, must keep passing) ------------------

def test_build_arcs_shares_boundary_between_neighbours():
    # Two regions split down the middle share ONE boundary arc — that shared
    # arc is what makes the output watertight.
    labels = np.zeros((6, 6), np.int32)
    labels[:, 3:] = 1
    arcs, region_arcs = build_arcs(labels)
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


# ---- P³ front half --------------------------------------------------------

def test_colour_equals_region_adjacent_paints_differ():
    # The core P³ invariant: because a region is a connected same-paint area,
    # any two ADJACENT regions must carry different paints. Impossible to get a
    # same-colour boundary or same-colour nesting.
    P = np.array(
        [[0, 0, 1, 1],
         [0, 0, 1, 1],
         [2, 2, 1, 1],
         [2, 2, 3, 3]], np.int32,
    )
    labels, nreg, reg_sel = _labels_from_paint_map(P, 4)
    assert nreg >= 4
    for A, B in ((labels[:, :-1], labels[:, 1:]), (labels[:-1, :], labels[1:, :])):
        m = A != B
        assert np.all(reg_sel[A[m]] != reg_sel[B[m]]), "adjacent regions must differ in paint"


def test_dissolve_removes_subminimum_region():
    # A 1px-wide sliver of paint 2 between two big halves is below the radius
    # floor and must be absorbed into a neighbour paint.
    P = np.zeros((12, 13), np.int32)
    P[:, 6] = 2          # 1px sliver
    P[:, 7:] = 1
    out = _dissolve(P.copy(), nsel=3, min_radius=3.0)
    assert 2 not in np.unique(out), "sub-minimum sliver must be dissolved away"
    assert set(np.unique(out).tolist()) <= {0, 1}


def test_linerate_to_svg_labels_every_region():
    arr = np.zeros((60, 60, 3), np.uint8)
    arr[:20] = (200, 60, 60)
    arr[20:40] = (60, 200, 60)
    arr[40:] = (60, 60, 200)
    img = Image.fromarray(arr, "RGB")
    pal_ok, pal_rgb = _mini_palette([(200, 60, 60), (60, 200, 60), (60, 60, 200)])
    svg, region_count, _ = linerate_to_svg(
        img, line_thickness=1.0, flatten=0.2, detail=0.5, num_colors=6, min_radius=3.0,
        palette_oklab=pal_ok, palette_rgb=pal_rgb,
    )
    assert '<g id="regions">' in svg and '<g id="numbers">' in svg
    assert region_count >= 3
    assert svg.count("<text ") == region_count       # every region gets a number


def test_linerate_to_svg_uniform_font():
    arr = np.zeros((80, 80, 3), np.uint8)
    arr[:40] = (200, 60, 60)
    arr[40:] = (60, 60, 200)
    img = Image.fromarray(arr, "RGB")
    pal_ok, pal_rgb = _mini_palette([(200, 60, 60), (60, 60, 200)])
    svg, _, _ = linerate_to_svg(
        img, flatten=0.2, detail=0.5, num_colors=4, min_radius=8.0,
        palette_oklab=pal_ok, palette_rgb=pal_rgb,
    )
    fonts = [float(f) for f in re.findall(r'font-size="([\d.]+)"', svg)]
    assert fonts
    # uniform (capped/derived from min_radius, not per-region radius)
    assert max(fonts) - min(fonts) < 1e-6 or max(fonts) <= min(1.4 * 8.0, 24.0) + 1e-6


def test_linerate_uses_only_real_palette_paints():
    arr = np.zeros((48, 48, 3), np.uint8)
    arr[:, :16] = (200, 60, 60)
    arr[:, 16:32] = (60, 200, 60)
    arr[:, 32:] = (60, 60, 200)
    img = Image.fromarray(arr, "RGB")
    pal_ok, pal_rgb = _mini_palette([(200, 60, 60), (60, 200, 60), (60, 60, 200), (230, 230, 230)])
    svg, _, used = linerate_to_svg(
        img, flatten=0.2, detail=0.5, num_colors=8, min_radius=3.0,
        palette_oklab=pal_ok, palette_rgb=pal_rgb,
    )
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    palette_hex = {f"#{r:02x}{g:02x}{b:02x}" for r, g, b in pal_rgb}
    assert fills, "expected region fills"
    assert fills <= palette_hex, "every fill must be a real palette paint (none invented)"
    assert all(0 <= u < len(pal_rgb) for u in used)


def test_linerate_paints_used_within_num_colors():
    arr = (np.random.default_rng(0).integers(0, 255, (48, 48, 3))).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    # a rich palette; the pipeline must not select more than num_colors paints
    rgbs = [(r, g, b) for r in (30, 120, 210) for g in (30, 120, 210) for b in (30, 210)]
    pal_ok, pal_rgb = _mini_palette(rgbs)
    svg, _, used = linerate_to_svg(
        img, flatten=0.3, detail=0.5, num_colors=5, min_radius=2.0,
        palette_oklab=pal_ok, palette_rgb=pal_rgb,
    )
    assert len(used) <= 5
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    assert len(fills) <= 5


@pytest.mark.parametrize("restriction", ["top_n", "pam"])
def test_selection_both_paths_use_only_real_paints(restriction):
    # Both shared reductions (top_n / pam) must select ONLY real palette chips
    # and never exceed num_colors — same contract as pixelate/circulate.
    arr = np.zeros((48, 48, 3), np.uint8)
    arr[:, :16] = (200, 60, 60)
    arr[:, 16:32] = (60, 200, 60)
    arr[:, 32:] = (60, 60, 200)
    img = Image.fromarray(arr, "RGB")
    rgbs = [(r, g, b) for r in (30, 120, 210) for g in (30, 120, 210) for b in (30, 210)]
    pal_ok, pal_rgb = _mini_palette(rgbs)
    svg, _, used = linerate_to_svg(
        img, flatten=0.2, detail=0.6, num_colors=6, min_radius=2.0,
        palette_oklab=pal_ok, palette_rgb=pal_rgb, palette_restriction=restriction,
    )
    fills = set(re.findall(r'fill="(#[0-9a-f]{6})"', svg))
    palette_hex = {f"#{r:02x}{g:02x}{b:02x}" for r, g, b in pal_rgb}
    assert fills and fills <= palette_hex, "only real palette chips"
    assert len(used) <= 6 and all(0 <= u < len(pal_rgb) for u in used)
