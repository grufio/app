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


def _remove_transform(path: str) -> str:
    """Strip the `transform="..."` attribute. Used after a merge rewrites a
    path's `d` in absolute (world) coordinates — the vtracer `translate`
    that positioned the original local `d` must go, or it would be applied
    a second time on top of the already-absolute merged geometry."""
    return _PATH_TRANSFORM_RE.sub("", path, count=1)


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


# vtracer's `cutout` output leaves sub-pixel-to-~1.5px gaps between adjacent
# regions (no shared edge). Merging must see across those gaps: find a
# neighbour within this tolerance, and dilate the tiny region by the same
# amount so the union closes into a single polygon instead of a MultiPolygon.
# (Measured on real output: hairline gaps cluster ≤ 1.4px.)
_MERGE_GAP_EPS = 1.5


def merge_tiny_regions(
    paths: list[str],
    indices: np.ndarray,
    min_radius: float = 8.0,
    max_iter: int | None = None,
) -> tuple[list[str], np.ndarray]:
    """Iteratively merge regions whose largest inscribed circle has radius
    `< min_radius` into their largest-area neighbour (Shapely union), so
    every surviving region stays wide enough to paint + hold its number.

    Output is a new (paths, indices) pair: the tiny path is removed and the
    target's `d` is rewritten to the merged (absolute) outline with its
    now-stale `transform` stripped. The target's fill (colour) stays, so the
    tiny inherits it and the shared black boundary disappears topologically.

    Robust to vtracer's `cutout` gaps: neighbours are matched within
    `_MERGE_GAP_EPS`, and if a plain union yields a MultiPolygon (hairline
    gap) the tiny is dilated by the same tolerance to bridge it. Inscribed
    radii are cached and recomputed only for a region that actually changed,
    so the pass stays ~O(n) polylabel calls even when many regions merge.

    Halts when nothing is below `min_radius` (or after `max_iter`, default =
    the region count — each successful merge removes exactly one region, so
    that is a can't-loop-forever bound, not a coverage cap).
    """
    polys = _parse_all(paths)
    work_paths = list(paths)
    work_indices = [int(i) for i in indices]
    # Cache each region's inscribed radius; None mirrors an unparsed/dropped
    # polygon so it is never picked as a tiny.
    radii: list[float | None] = [
        None if p is None else _polylabel_radius(p)[2] for p in polys
    ]
    if max_iter is None:
        max_iter = len(paths)

    for _ in range(max_iter):
        # Smallest below-threshold region by cached radius. None → stable.
        tiny_idx: int | None = None
        tiny_radius = float("inf")
        for i, r in enumerate(radii):
            if r is None:
                continue
            if r < min_radius and r < tiny_radius:
                tiny_radius = r
                tiny_idx = i
        if tiny_idx is None:
            break

        neighbor_idx = find_largest_neighbor(tiny_idx, polys, eps=_MERGE_GAP_EPS)
        tiny_poly = polys[tiny_idx]
        target_poly = polys[neighbor_idx] if neighbor_idx is not None else None
        if target_poly is None or tiny_poly is None:
            # Genuinely isolated (no neighbour within tolerance). Keep the
            # path in the output but stop re-picking it as a tiny.
            radii[tiny_idx] = None
            continue

        try:
            merged = unary_union([target_poly, tiny_poly])
            if not isinstance(merged, Polygon) or merged.is_empty:
                # Hairline gap → MultiPolygon. Dilate the tiny to bridge it.
                merged = unary_union([target_poly, tiny_poly.buffer(_MERGE_GAP_EPS)])
        except Exception:
            radii[tiny_idx] = None
            continue
        if not isinstance(merged, Polygon) or merged.is_empty:
            radii[tiny_idx] = None
            continue

        # `merged` is in world coordinates (path_to_polygon applied each
        # path's translate), so the rewritten `d` is absolute — drop the
        # target's now-stale `transform` to avoid a double offset. Update the
        # target's cached radius; the merged region is larger, so it may now
        # clear the threshold.
        new_d = polygon_to_path_d(merged)
        work_paths[neighbor_idx] = _remove_transform(_set_d(work_paths[neighbor_idx], new_d))
        polys[neighbor_idx] = merged
        radii[neighbor_idx] = _polylabel_radius(merged)[2]

        # Drop the tiny row from every parallel list (kept in lock-step).
        del work_paths[tiny_idx]
        del work_indices[tiny_idx]
        del polys[tiny_idx]
        del radii[tiny_idx]

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
