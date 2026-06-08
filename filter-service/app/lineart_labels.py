"""
Paint-by-numbers label placement + tiny-region merge for Lineart.

Two operations, run sequentially after vtracer + palette-snap:

  1. `merge_tiny_regions` — repeatedly find the smallest unlabelable
     region (inscribed-circle radius < `min_radius`), union it into its
     largest neighbour via Shapely. Iterates until stable or
     `max_iter` runs out (pathological merge chains).
  2. `render_numbers_group` — for each surviving region, place a `<text>`
     at the polylabel point with font-size proportional to the inscribed
     radius. Emit a single `<g id="numbers">` group.

Both operate on the same `(paths, indices)` shape `lineart.py` already
has: `paths` is the list of `<path .../>` markup strings, `indices` is
the per-path palette-chip index. Merge rewrites both: tiny rows are
dropped, the target row's path becomes the unioned polygonal path.

`min_radius` covers two paint-by-numbers concerns with one parameter:
"region too small to fit a number" and "two black lines too close
together" — both manifest as a small largest-inscribed-circle.
"""
from __future__ import annotations

import re

import numpy as np
from shapely.geometry import Polygon
from shapely.ops import polylabel, unary_union

from .region_geometry import (
    find_largest_neighbor,
    path_to_polygon,
    polygon_to_path_d,
)


_PATH_D_RE = re.compile(r'\bd="([^"]*)"')
_PATH_FILL_RE = re.compile(r'\bfill="(#[0-9A-Fa-f]{6})"')
_PATH_TRANSFORM_RE = re.compile(r'\btransform="([^"]*)"')


def _extract_d(path: str) -> str | None:
    m = _PATH_D_RE.search(path)
    return m.group(1) if m else None


def _extract_transform(path: str) -> str | None:
    m = _PATH_TRANSFORM_RE.search(path)
    return m.group(1) if m else None


def _extract_fill(path: str) -> str | None:
    m = _PATH_FILL_RE.search(path)
    return m.group(1) if m else None


def _set_d(path: str, new_d: str) -> str:
    return _PATH_D_RE.sub(f'd="{new_d}"', path, count=1)


def _polylabel_radius(polygon: Polygon) -> tuple[float, float, float]:
    """Return `(cx, cy, radius)` for the largest inscribed circle. The
    tolerance for polylabel scales with the polygon's perimeter so big
    regions don't spend forever refining sub-pixel precision."""
    tolerance = max(0.5, polygon.length / 1000.0)
    pole = polylabel(polygon, tolerance=tolerance)
    radius = pole.distance(polygon.exterior)
    return pole.x, pole.y, radius


def _parse_all(
    paths: list[str],
) -> list[Polygon | None]:
    """Parse every path's `d` (+ transform) into a Shapely polygon. Paths
    whose geometry is invalid get None — they're carried through the
    merge step unchanged (kept in the output, just not label-placed)."""
    out: list[Polygon | None] = []
    for p in paths:
        d = _extract_d(p)
        if not d:
            out.append(None)
            continue
        out.append(path_to_polygon(d, _extract_transform(p)))
    return out


def merge_tiny_regions(
    paths: list[str],
    indices: np.ndarray,
    min_radius: float = 8.0,
    max_iter: int = 5,
) -> tuple[list[str], np.ndarray]:
    """Iteratively merge regions with inscribed-circle radius
    `< min_radius` into their largest area neighbour, via Shapely union.

    Output is a new (paths, indices) pair: the tiny path is removed, the
    target's `d` attribute is rewritten to the merged polygon's
    (polygonal) outline. Target's fill (= colour) stays put — the tiny
    inherits it via the union, no spurious black line between the
    merged regions because the shared boundary is gone topologically.

    Halts when no region needs merging OR `max_iter` runs are reached.
    """
    polys = _parse_all(paths)
    work_paths = list(paths)
    work_indices = list(int(i) for i in indices)

    for _ in range(max_iter):
        # Find the smallest tiny-radius region. None means stable.
        tiny_idx: int | None = None
        tiny_radius = float("inf")
        for i, poly in enumerate(polys):
            if poly is None:
                continue
            _, _, r = _polylabel_radius(poly)
            if r < min_radius and r < tiny_radius:
                tiny_radius = r
                tiny_idx = i
        if tiny_idx is None:
            break

        neighbor_idx = find_largest_neighbor(tiny_idx, polys)
        if neighbor_idx is None:
            # Defensive: isolated speckle with no neighbour. Mark it
            # parsed-but-unmergeable so the loop doesn't re-pick it.
            polys[tiny_idx] = None
            continue

        target_poly = polys[neighbor_idx]
        tiny_poly = polys[tiny_idx]
        if target_poly is None or tiny_poly is None:
            polys[tiny_idx] = None
            continue
        try:
            merged = unary_union([target_poly, tiny_poly])
        except Exception:
            polys[tiny_idx] = None
            continue
        if not isinstance(merged, Polygon) or merged.is_empty:
            # Union produced a MultiPolygon (tiny + neighbour not
            # actually adjacent at the buffer eps) — skip the merge.
            polys[tiny_idx] = None
            continue

        new_d = polygon_to_path_d(merged)
        work_paths[neighbor_idx] = _set_d(work_paths[neighbor_idx], new_d)
        polys[neighbor_idx] = merged

        # Drop the tiny: remove from paths, indices, polys lists.
        # We modify in reverse-popping fashion to keep indices stable
        # for the remainder of this iteration.
        del work_paths[tiny_idx]
        del work_indices[tiny_idx]
        del polys[tiny_idx]

    return work_paths, np.asarray(work_indices, dtype=np.int32)


def render_numbers_group(
    paths: list[str],
    indices: np.ndarray,
    label_map: dict[int, int],
    min_radius: float = 8.0,
    max_font: float = 24.0,
) -> str:
    """Emit a `<g id="numbers">` group with one `<text>` per region whose
    inscribed-circle radius `≥ min_radius`. Each `<text>` sits at the
    polylabel point with font-size `min(1.4 × radius, max_font)`.

    Regions that fall below `min_radius` here (despite the prior merge
    pass) are skipped — that's the no-neighbour edge case from
    `merge_tiny_regions`. In practice this almost never fires because
    `merge_tiny_regions` already merged everything it could.
    """
    items: list[str] = []
    for path, idx in zip(paths, indices):
        d = _extract_d(path)
        if not d:
            continue
        polygon = path_to_polygon(d, _extract_transform(path))
        if polygon is None:
            continue
        cx, cy, radius = _polylabel_radius(polygon)
        if radius < min_radius:
            continue
        font_size = min(1.4 * radius, max_font)
        label = label_map[int(idx)]
        items.append(
            f'<text x="{cx:.4f}" y="{cy:.4f}" '
            f'font-size="{font_size:.4f}" font-family="sans-serif" '
            f'text-anchor="middle" dominant-baseline="central" '
            f'fill="black" pointer-events="none">{label}</text>'
        )
    return f'<g id="numbers">\n    {chr(10).join(items)}\n  </g>'
