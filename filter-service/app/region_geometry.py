"""
Geometric helpers for the Lineart paint-by-numbers pipeline.

Three operations on vtracer's per-region SVG paths:

  - `path_to_polygon`        — parse a vtracer `<path d="...">` into a
    Shapely polygon (Cubic Beziers flattened via de Casteljau).
  - `polygon_to_path_d`      — emit a Shapely polygon back as an SVG
    `d` string (M + L only; loses curvature, used only on regions we
    merged via Shapely-union where curves are gone anyway).
  - `find_largest_neighbor`  — index of the area-largest adjacent
    region, used by the tiny-region merge step. Adjacency via a small
    `buffer(eps).intersects(other)` because vtracer's floating-point
    boundaries can miss exact `touches()` by sub-pixel amounts.

These are pure geometry — no SVG I/O, no Lineart-specific logic. The
tiny-region merge orchestration lives in `lineart_labels.py`.
"""
from __future__ import annotations

import re

import numpy as np
from shapely.geometry import Polygon


# Path tokenizer: each command (single letter) + the numeric arguments
# that follow it (space- or comma-separated, optional sign, decimal).
# We capture every letter so unsupported commands (Q/A/S/T/H/V) are
# noticed and the parser can bail instead of mis-attributing their
# coordinates to a neighbouring command.
_CMD_RE = re.compile(r"([A-Za-z])([^A-Za-z]*)")
_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?")
_SCALE_RE = re.compile(
    r"scale\(\s*(-?\d+(?:\.\d+)?)(?:[,\s]+(-?\d+(?:\.\d+)?))?\s*\)"
)
_TRANSLATE_RE = re.compile(
    r"translate\(\s*(-?\d+(?:\.\d+)?)(?:[,\s]+(-?\d+(?:\.\d+)?))?\s*\)"
)


def _parse_transform(transform_attr: str | None) -> tuple[float, float, float, float]:
    """Parse a vtracer `transform` attribute into `(sx, sy, tx, ty)`.

    vtracer emits `translate(x, y)` on EVERY path (each region's `d` is
    written relative to its own bounding-box origin) — historically this
    parser only handled `scale(...)`, so the translate was silently
    dropped and every region collapsed onto the local origin (numbers
    piled up top-left, neighbour detection saw phantom overlaps). Handle
    both: `translate(tx, ty)` and `scale(sx, sy)`. Single-arg forms follow
    SVG semantics — `scale(s)` → `sy = sx`, `translate(t)` → `ty = 0`.
    Defaults to identity `(1, 1, 0, 0)` when absent/unparseable.
    """
    sx = sy = 1.0
    tx = ty = 0.0
    if not transform_attr:
        return sx, sy, tx, ty
    ms = _SCALE_RE.search(transform_attr)
    if ms:
        sx = float(ms.group(1))
        sy = float(ms.group(2)) if ms.group(2) is not None else sx
    mt = _TRANSLATE_RE.search(transform_attr)
    if mt:
        tx = float(mt.group(1))
        ty = float(mt.group(2)) if mt.group(2) is not None else 0.0
    return sx, sy, tx, ty


def _flatten_cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    out: list[tuple[float, float]],
    depth: int = 0,
) -> None:
    """Adaptive de Casteljau subdivision: split until the control polygon
    is flat enough, then emit the endpoint. Depth-capped at 8 to bound
    cost. `out` accumulates intermediate points; the starting endpoint
    is the caller's responsibility (already in `out`), this appends p3."""
    flat = _is_flat_enough(p0, p1, p2, p3)
    if flat or depth >= 8:
        out.append(p3)
        return
    # Subdivide at t=0.5 via midpoint construction.
    m01 = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
    m12 = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
    m23 = ((p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2)
    m012 = ((m01[0] + m12[0]) / 2, (m01[1] + m12[1]) / 2)
    m123 = ((m12[0] + m23[0]) / 2, (m12[1] + m23[1]) / 2)
    m0123 = ((m012[0] + m123[0]) / 2, (m012[1] + m123[1]) / 2)
    _flatten_cubic(p0, m01, m012, m0123, out, depth + 1)
    _flatten_cubic(m0123, m123, m23, p3, out, depth + 1)


def _is_flat_enough(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    tolerance_sq: float = 0.25,
) -> bool:
    """Cheap flatness test: max squared distance from control points to
    the p0→p3 chord. Tolerance 0.5 px (0.25 squared) gives a pixel-clean
    polyline approximation."""
    dx, dy = p3[0] - p0[0], p3[1] - p0[1]
    chord_sq = dx * dx + dy * dy
    if chord_sq == 0:
        # p0 == p3: measure raw distance of p1, p2 from p0.
        d1 = (p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2
        d2 = (p2[0] - p0[0]) ** 2 + (p2[1] - p0[1]) ** 2
        return max(d1, d2) <= tolerance_sq
    # Perpendicular distance² from control points to the chord.
    c1 = ((p1[0] - p0[0]) * dy - (p1[1] - p0[1]) * dx) ** 2 / chord_sq
    c2 = ((p2[0] - p0[0]) * dy - (p2[1] - p0[1]) * dx) ** 2 / chord_sq
    return max(c1, c2) <= tolerance_sq


def path_to_polygon(d: str, transform_attr: str | None = None) -> Polygon | None:
    """Parse a vtracer `<path d="...">` element into a Shapely polygon.

    Supports the SVG commands vtracer emits in spline mode: M / L / C / Z
    (and their relative-lowercase variants). Cubic Beziers are flattened
    to polylines via de Casteljau. Any unsupported command makes the
    parser bail out → returns None.

    `transform_attr` is the raw value of the path's `transform` attribute
    (vtracer emits `"translate(tx, ty)"`); applied post-parse so the
    polygon ends up in the same coordinate space as the surrounding SVG
    viewBox — without this the labels/merge run in each path's local
    origin space (all regions stacked at 0,0).
    """
    sx, sy, tx, ty = _parse_transform(transform_attr)
    points: list[tuple[float, float]] = []
    current = (0.0, 0.0)
    subpath_start: tuple[float, float] | None = None

    for cmd_match in _CMD_RE.finditer(d):
        cmd = cmd_match.group(1)
        args = [float(n) for n in _NUM_RE.findall(cmd_match.group(2))]
        relative = cmd.islower()
        upper = cmd.upper()

        if upper == "M":
            if len(args) < 2:
                return None
            x, y = args[0], args[1]
            if relative:
                x += current[0]
                y += current[1]
            current = (x, y)
            subpath_start = current
            points.append(current)
            # Extra coord pairs after M are implicit L commands.
            i = 2
            while i + 1 < len(args):
                x, y = args[i], args[i + 1]
                if relative:
                    x += current[0]
                    y += current[1]
                current = (x, y)
                points.append(current)
                i += 2
        elif upper == "L":
            i = 0
            while i + 1 < len(args):
                x, y = args[i], args[i + 1]
                if relative:
                    x += current[0]
                    y += current[1]
                current = (x, y)
                points.append(current)
                i += 2
        elif upper == "C":
            i = 0
            while i + 5 < len(args):
                x1, y1 = args[i], args[i + 1]
                x2, y2 = args[i + 2], args[i + 3]
                x3, y3 = args[i + 4], args[i + 5]
                if relative:
                    x1 += current[0]; y1 += current[1]
                    x2 += current[0]; y2 += current[1]
                    x3 += current[0]; y3 += current[1]
                _flatten_cubic(current, (x1, y1), (x2, y2), (x3, y3), points)
                current = (x3, y3)
                i += 6
        elif upper == "Z":
            if subpath_start is not None:
                points.append(subpath_start)
                current = subpath_start
        else:
            # Unsupported command (Q, A, S, T, H, V) → bail.
            return None

    if len(points) < 4:
        return None

    # SVG order is translate ∘ scale: scale the local point, then offset.
    coords = [(x * sx + tx, y * sy + ty) for x, y in points]
    try:
        poly = Polygon(coords)
    except Exception:
        return None
    if not poly.is_valid:
        poly = poly.buffer(0)  # fix self-intersection if vtracer emitted one
        if not isinstance(poly, Polygon) or poly.is_empty:
            return None
    if poly.area <= 0:
        return None
    return poly


def polygon_to_path_d(polygon: Polygon) -> str:
    """Emit a Shapely polygon as an SVG path `d` string. M + L + Z only —
    used for the merged regions where the union already discarded any
    curvature anyway. Holes (interior rings) are emitted as additional
    subpaths so the SVG even-odd fill rule paints them as holes."""

    def ring_to_d(coords) -> str:
        # `coords` is a CoordinateSequence; drop the closing duplicate
        # vertex Shapely keeps internally.
        pts = list(coords)
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if not pts:
            return ""
        head = f"M {pts[0][0]:.4f} {pts[0][1]:.4f}"
        tail = " ".join(f"L {x:.4f} {y:.4f}" for x, y in pts[1:])
        return f"{head} {tail} Z"

    parts = [ring_to_d(polygon.exterior.coords)]
    for ring in polygon.interiors:
        parts.append(ring_to_d(ring.coords))
    return " ".join(p for p in parts if p)


def find_largest_neighbor(
    tiny_idx: int,
    polygons: list[Polygon | None],
    eps: float = 0.5,
) -> int | None:
    """Return the index of the area-largest polygon that touches
    `polygons[tiny_idx]` within an `eps`-buffer tolerance. `polygons`
    may contain None entries (already-merged regions); they're skipped.
    Returns None when no neighbour is found (defense for isolated
    speckle — shouldn't happen with vtracer `hierarchical="cutout"`).
    """
    target = polygons[tiny_idx]
    if target is None:
        return None
    buffered = target.buffer(eps)
    best_idx: int | None = None
    best_area = -1.0
    for i, candidate in enumerate(polygons):
        if i == tiny_idx or candidate is None:
            continue
        if not buffered.intersects(candidate):
            continue
        a = candidate.area
        if a > best_area:
            best_area = a
            best_idx = i
    return best_idx
