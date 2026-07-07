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

import heapq
import re

import numpy as np
from shapely import STRtree
from shapely.geometry import Polygon
from shapely.ops import polylabel, unary_union

from .region_geometry import (
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
    max_iter: int | None = None,  # kept for API compat; unused (single-pass)
) -> tuple[list[str], np.ndarray]:
    """Merge regions whose largest inscribed circle has radius `< min_radius`
    into their largest-area neighbour, so every surviving region stays wide
    enough to paint + hold its number.

    Output is a new (paths, indices) pair: absorbed paths are dropped and the
    surviving representative's `d` is rewritten to the merged (absolute)
    outline with its now-stale `transform` stripped. The representative is the
    largest-area member, so its fill (colour) + palette index carry the group.

    Performance: a detailed trace has ~10³ raw regions, most of them tiny.
    Merging them one-by-one into a *growing* blob is O(Σ vertices) per absorb —
    an 18s timeout on real images. Instead this is two cheap phases:
      1. Grouping — union-find over the regions, no geometry ops. Smallest-
         first, each tiny joins its largest-area neighbour's group. STRtree
         gives adjacency in O(n log n).
      2. Realise — ONE bulk `unary_union` per group (Shapely fuses a whole
         cluster far faster than N incremental unions). Total ~O(n log n).

    Robust to vtracer's `cutout` gaps: adjacency is matched within
    `_MERGE_GAP_EPS`, and a group whose plain union leaves a MultiPolygon
    (hairline gaps) is dilated by that tolerance to bridge them. Order is
    preserved — a survivor stays at its original position, absorbed rows drop.
    """
    polys = _parse_all(paths)
    n = len(polys)
    if n == 0:
        return [], np.asarray([], dtype=np.int32)

    radii = [None if p is None else _polylabel_radius(p)[2] for p in polys]

    # Union-find keyed by area: the root is always the largest-area member, so
    # the group keeps the dominant region's colour + index.
    parent = list(range(n))
    group_area = [0.0 if p is None else p.area for p in polys]

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        if group_area[ra] < group_area[rb]:
            ra, rb = rb, ra
        parent[rb] = ra
        group_area[ra] += group_area[rb]

    # Adjacency (within tolerance) via one STRtree over the parsed polygons.
    tree_idx = [i for i in range(n) if polys[i] is not None]
    tree = STRtree([polys[i] for i in tree_idx]) if tree_idx else None
    neighbors: list[list[int]] = [[] for _ in range(n)]
    if tree is not None:
        for i in tree_idx:
            buf = polys[i].buffer(_MERGE_GAP_EPS)
            for pos in tree.query(buf):
                j = tree_idx[int(pos)]
                if j != i and polys[j] is not None and buf.intersects(polys[j]):
                    neighbors[i].append(j)

    # Phase 1 — grouping (geometry-free). Smallest tiny first; join it to the
    # largest-area neighbouring GROUP (resolved live through union-find).
    heap = [(r, i) for i, r in enumerate(radii) if r is not None and r < min_radius]
    heapq.heapify(heap)
    while heap:
        _, i = heapq.heappop(heap)
        ri = find(i)
        best_root: int | None = None
        best_area = -1.0
        for j in neighbors[i]:
            rj = find(j)
            if rj == ri:
                continue
            if group_area[rj] > best_area:
                best_area = group_area[rj]
                best_root = rj
        if best_root is None:
            continue  # isolated within tolerance — kept as-is, unlabelled-safe
        union(ri, best_root)

    # Phase 2 — realise. Collect members per surviving root, in original order.
    members: dict[int, list[int]] = {}
    for i in range(n):
        if polys[i] is None:
            continue
        members.setdefault(find(i), []).append(i)

    out_paths: list[str] = []
    out_indices: list[int] = []
    for i in range(n):
        if polys[i] is None:
            # Unparsed geometry: carry through untouched (never merged).
            out_paths.append(paths[i])
            out_indices.append(int(indices[i]))
            continue
        if find(i) != i:
            continue  # absorbed into another region → dropped
        grp = members[i]
        if len(grp) == 1:
            out_paths.append(paths[i])
        else:
            member_polys = [polys[m] for m in grp]
            try:
                merged = unary_union(member_polys)
                if not isinstance(merged, Polygon) or merged.is_empty:
                    # Hairline gaps → MultiPolygon. Dilate to bridge, union again.
                    merged = unary_union([mp.buffer(_MERGE_GAP_EPS) for mp in member_polys])
            except Exception:
                merged = None
            if isinstance(merged, Polygon) and not merged.is_empty:
                out_paths.append(_remove_transform(_set_d(paths[i], polygon_to_path_d(merged))))
            else:
                out_paths.append(paths[i])  # fallback: keep representative as-is
        out_indices.append(int(indices[i]))

    return out_paths, np.asarray(out_indices, dtype=np.int32)


def render_numbers_group(
    paths: list[str],
    indices: np.ndarray,
    label_map: dict[int, int],
    min_radius: float = 8.0,
    max_font: float = 24.0,
) -> str:
    """Emit a `<g id="numbers">` group with one `<text>` per region.

    Every region the merge kept gets a number — the merge already removed
    everything below `min_radius`, so labelling all survivors means no bare
    regions (previously a below-threshold survivor was silently skipped).

    Font size is UNIFORM across the trace: `min(1.4 × min_radius, max_font)`,
    so the labels read as one consistent size instead of scaling per region.
    A region that (rarely) still sits below the threshold shrinks its own
    label just enough to fit (`min(uniform, 1.4 × radius)`) so it never
    overflows; the common case is every label at the same `uniform` size.
    """
    uniform_font = min(1.4 * min_radius, max_font)
    items: list[str] = []
    for path, idx in zip(paths, indices):
        d = _extract_d(path)
        if not d:
            continue
        polygon = path_to_polygon(d, _extract_transform(path))
        if polygon is None:
            continue
        cx, cy, radius = _polylabel_radius(polygon)
        if radius <= 0:
            continue  # degenerate geometry only
        # Uniform for real regions; only a sub-threshold sliver shrinks to fit.
        font_size = min(uniform_font, 1.4 * radius)
        label = label_map[int(idx)]
        items.append(
            f'<text x="{cx:.4f}" y="{cy:.4f}" '
            f'font-size="{font_size:.4f}" font-family="sans-serif" '
            f'text-anchor="middle" dominant-baseline="central" '
            f'fill="black" pointer-events="none">{label}</text>'
        )
    return f'<g id="numbers">\n    {chr(10).join(items)}\n  </g>'
