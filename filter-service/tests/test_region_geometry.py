"""Unit tests for region_geometry helpers."""
from __future__ import annotations

import math

from shapely.geometry import Polygon

from app.region_geometry import (
    find_largest_neighbor,
    path_to_polygon,
    polygon_to_path_d,
)


def test_path_to_polygon_rectangle():
    poly = path_to_polygon("M 0 0 L 10 0 L 10 5 L 0 5 Z")
    assert poly is not None
    assert math.isclose(poly.area, 50.0, rel_tol=1e-6)


def test_path_to_polygon_with_scale_transform():
    poly = path_to_polygon("M 0 0 L 10 0 L 10 10 L 0 10 Z", "scale(0.5 0.5)")
    assert poly is not None
    # Half-scale on both axes → quarter area.
    assert math.isclose(poly.area, 25.0, rel_tol=1e-6)


def test_path_to_polygon_with_translate_transform():
    # vtracer emits `translate(tx, ty)` on EVERY path (local `d` + bbox
    # offset). Regression: this was silently dropped, collapsing every
    # region onto the origin (numbers piled top-left). The polygon must
    # land at the translated position.
    poly = path_to_polygon("M 0 0 L 10 0 L 10 10 L 0 10 Z", "translate(100 50)")
    assert poly is not None
    minx, miny, maxx, maxy = poly.bounds
    assert math.isclose(minx, 100.0, rel_tol=1e-6)
    assert math.isclose(miny, 50.0, rel_tol=1e-6)
    assert math.isclose(maxx, 110.0, rel_tol=1e-6)
    assert math.isclose(maxy, 60.0, rel_tol=1e-6)
    assert math.isclose(poly.area, 100.0, rel_tol=1e-6)


def test_path_to_polygon_translate_single_arg_defaults_ty_zero():
    # SVG `translate(t)` means ty = 0 (not ty = tx).
    poly = path_to_polygon("M 0 0 L 4 0 L 4 4 L 0 4 Z", "translate(7)")
    assert poly is not None
    minx, miny, _, _ = poly.bounds
    assert math.isclose(minx, 7.0, rel_tol=1e-6)
    assert math.isclose(miny, 0.0, rel_tol=1e-6)


def test_path_to_polygon_with_cubic_bezier():
    # Approximates a quadrant; the exact area depends on the curve
    # subdivision but is bounded between the chord and the bounding box.
    poly = path_to_polygon("M 0 0 L 10 0 C 10 5 5 10 0 10 Z")
    assert poly is not None
    assert 0 < poly.area < 100


def test_path_to_polygon_parses_holes_as_interiors():
    # A merged region (or a holey vtracer region) has multiple subpaths:
    # the largest ring is the exterior, the rest are holes. Flattening them
    # into one ring self-intersects and mis-measures the region (→ the label
    # step then drops it: "region has no number"). Outer 100×100, inner 40×40.
    d = "M 0 0 L 100 0 L 100 100 L 0 100 Z M 30 30 L 70 30 L 70 70 L 30 70 Z"
    poly = path_to_polygon(d)
    assert poly is not None
    assert len(poly.interiors) == 1
    assert math.isclose(poly.area, 100 * 100 - 40 * 40, rel_tol=1e-6)


def test_path_to_polygon_rejects_too_few_points():
    assert path_to_polygon("M 0 0 L 5 5") is None


def test_path_to_polygon_rejects_unsupported_command():
    # Q (quadratic) isn't emitted by vtracer in spline mode; if it does
    # appear we'd rather skip the path than mis-parse it.
    assert path_to_polygon("M 0 0 Q 5 5 10 0 Z") is None


def test_path_to_polygon_handles_empty():
    assert path_to_polygon("") is None


def test_polygon_to_path_d_round_trip():
    poly = Polygon([(0, 0), (10, 0), (10, 5), (0, 5)])
    d = polygon_to_path_d(poly)
    assert d.startswith("M ")
    assert d.endswith(" Z")
    parsed = path_to_polygon(d)
    assert parsed is not None
    assert math.isclose(parsed.area, 50.0, rel_tol=1e-6)


def test_polygon_to_path_d_with_hole():
    outer = [(0, 0), (10, 0), (10, 10), (0, 10)]
    hole = [(3, 3), (7, 3), (7, 7), (3, 7)]
    poly = Polygon(outer, [hole])
    d = polygon_to_path_d(poly)
    # Two subpaths (outer + hole) → two M commands.
    assert d.count("M ") == 2
    assert d.count("Z") == 2


def test_find_largest_neighbor_picks_by_area():
    # Three side-by-side squares; the right one is largest. The middle
    # is the "tiny" target.
    left = Polygon([(0, 0), (4, 0), (4, 4), (0, 4)])
    middle = Polygon([(4, 0), (6, 0), (6, 4), (4, 4)])  # tiny target
    right = Polygon([(6, 0), (16, 0), (16, 4), (6, 4)])  # largest
    polys = [left, middle, right]
    neighbor = find_largest_neighbor(1, polys)
    assert neighbor == 2  # right has larger area than left


def test_find_largest_neighbor_with_floating_point_gap():
    # vtracer's floating-point boundaries can leave a sub-pixel gap; the
    # default eps-buffer (0.5) bridges it. Exact `touches()` would miss.
    a = Polygon([(0, 0), (4, 0), (4, 4), (0, 4)])
    # Gap of 0.05 px between a's right edge and b's left edge.
    b = Polygon([(4.05, 0), (8.05, 0), (8.05, 4), (4.05, 4)])
    neighbor = find_largest_neighbor(0, [a, b])
    assert neighbor == 1


def test_find_largest_neighbor_returns_none_when_isolated():
    isolated = Polygon([(0, 0), (1, 0), (1, 1), (0, 1)])
    far_away = Polygon([(100, 100), (101, 100), (101, 101), (100, 101)])
    assert find_largest_neighbor(0, [isolated, far_away]) is None


def test_find_largest_neighbor_skips_none_entries():
    a = Polygon([(0, 0), (4, 0), (4, 4), (0, 4)])
    polys: list[Polygon | None] = [a, None]
    assert find_largest_neighbor(0, polys) is None
