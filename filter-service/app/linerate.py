"""
Linerate filter pipeline — segmentation-based paint-by-numbers.

Unlike `lineart` (which bends the general-purpose vtracer raster→vector
tracer to the task and then fights its output), linerate treats
paint-by-numbers as what it is: a SEGMENTATION problem.

  quantise → connected-components label → raster-merge tiny regions →
  build the shared pixel-CRACK boundary graph → smooth each boundary ARC
  exactly once (RDP + Chaikin, junction endpoints fixed) → assemble each
  region's face from the shared smoothed arcs → snap fills to the palette →
  distance-transform for the number position → compose SVG.

Because every boundary arc is smoothed ONCE and both adjacent regions reuse
the identical polyline, the output is WATERTIGHT — no cutout gaps, no holes,
no per-region divergence at junctions (the failure modes that dogged lineart).
The largest-inscribed-circle radius (paintability + number placement) comes
for free from `cv2.distanceTransform`.

Emits the same SVG contract as lineart (`<g id="regions">` with
`<path fill stroke d/>` + `<g id="numbers">`), so the editor's
`prepareTraceSvg` / `TraceInlineSvg` render it unchanged.
"""
from __future__ import annotations

import numpy as np
import cv2
from PIL import Image, ImageFilter

from .lineart import quantise_image
from .oklab import nearest_palette_indices, rgb255_to_oklab
from .cell_labels import build_label_map


# ---- segmentation ---------------------------------------------------------

def _label_regions(rgb: np.ndarray) -> tuple[np.ndarray, int]:
    """Connected components per distinct colour → globally-unique region ids."""
    h, w, _ = rgb.shape
    colors, inv = np.unique(rgb.reshape(-1, 3), axis=0, return_inverse=True)
    cidx = inv.reshape(h, w).astype(np.int32)
    labels = np.full((h, w), -1, np.int32)
    nxt = 0
    for c in range(len(colors)):
        ncc, cc = cv2.connectedComponents((cidx == c).astype(np.uint8), connectivity=4)
        for k in range(1, ncc):
            labels[cc == k] = nxt
            nxt += 1
    return labels, nxt


def _region_radius(mask: np.ndarray) -> float:
    return float(cv2.distanceTransform(mask, cv2.DIST_L2, 5).max())


def merge_small_regions(labels: np.ndarray, min_radius: float) -> np.ndarray:
    """Relabel regions whose largest inscribed circle radius < `min_radius`
    into their largest-area 4-neighbour. Pure raster op → gap-free by
    construction (no Shapely geometry). Iterates until stable."""
    if min_radius <= 0:
        return _compact(labels)
    kernel = np.ones((3, 3), np.uint8)
    while True:
        merged = False
        for rid in np.unique(labels):
            mask = (labels == rid).astype(np.uint8)
            if mask.sum() == 0 or _region_radius(mask) >= min_radius:
                continue
            ring = cv2.dilate(mask, kernel) - mask
            nb = labels[ring > 0]
            nb = nb[nb != rid]
            if nb.size == 0:
                continue
            vals, cnts = np.unique(nb, return_counts=True)
            labels[mask > 0] = int(vals[cnts.argmax()])
            merged = True
            break
        if not merged:
            return _compact(labels)


def _compact(labels: np.ndarray) -> np.ndarray:
    ids = np.unique(labels)
    lut = np.zeros(int(ids.max()) + 1, np.int32)
    for i, v in enumerate(ids):
        lut[int(v)] = i
    return lut[labels]


# ---- shared-crack boundary graph -----------------------------------------

def build_arcs(labels: np.ndarray):
    """Boundary as a planar graph on pixel corners. Returns (arcs, region_arcs).
    Each arc = dict(corners=[(x,y)...] junction→junction, labels=(a,b)).
    Adjacent regions share the SAME arc → watertight after smoothing."""
    h, w = labels.shape
    above = np.concatenate([np.full((1, w), -1, np.int32), labels], 0)
    below = np.concatenate([labels, np.full((1, w), -1, np.int32)], 0)
    left = np.concatenate([np.full((h, 1), -1, np.int32), labels], 1)
    right = np.concatenate([labels, np.full((h, 1), -1, np.int32)], 1)

    adj: dict[tuple[int, int], list[tuple[int, int]]] = {}
    edge_side: dict[tuple, tuple[int, int]] = {}

    def add(a, b, la, lb):
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
        edge_side[(a, b) if a < b else (b, a)] = (int(la), int(lb))

    ys, xs = np.where(above != below)  # horizontal cracks: corner(x,y)-(x+1,y)
    for y, x in zip(ys.tolist(), xs.tolist()):
        add((x, y), (x + 1, y), above[y, x], below[y, x])
    ys, xs = np.where(left != right)   # vertical cracks: corner(x,y)-(x,y+1)
    for y, x in zip(ys.tolist(), xs.tolist()):
        add((x, y), (x, y + 1), left[y, x], right[y, x])

    is_junction = {c: (len(ns) != 2) for c, ns in adj.items()}
    for corner in ((0, 0), (w, 0), (0, h), (w, h)):  # keep image corners square
        if corner in is_junction:
            is_junction[corner] = True

    visited: set = set()

    def key(a, b):
        return (a, b) if a < b else (b, a)

    def trace(start, first):
        corners = [start, first]
        visited.add(key(start, first))
        prev, cur = start, first
        while not is_junction.get(cur, True):
            nxt = next((n for n in adj[cur] if key(cur, n) not in visited), None)
            if nxt is None:
                break
            visited.add(key(cur, nxt))
            corners.append(nxt)
            prev, cur = cur, nxt
        la, lb = edge_side[key(corners[0], corners[1])]
        return {"corners": corners, "labels": (la, lb)}

    arcs = []
    for j, isj in is_junction.items():
        if isj:
            for n in adj[j]:
                if key(j, n) not in visited:
                    arcs.append(trace(j, n))
    for c, ns in adj.items():  # pure loops (no junction)
        for n in ns:
            if key(c, n) not in visited:
                arcs.append(trace(c, n))

    region_arcs: dict[int, list[int]] = {}
    for i, arc in enumerate(arcs):
        for lb in arc["labels"]:
            if lb >= 0:
                region_arcs.setdefault(lb, []).append(i)
    return arcs, region_arcs


# ---- arc smoothing (shared) ----------------------------------------------

def _rdp(pts: list[np.ndarray], eps: float) -> list[np.ndarray]:
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    l2 = float(ab @ ab)
    dmax, idx = -1.0, -1
    for i in range(1, len(pts) - 1):
        ap = pts[i] - a
        d = np.hypot(*ap) if l2 == 0 else np.hypot(*(ap - np.clip(ap @ ab / l2, 0, 1) * ab))
        if d > dmax:
            dmax, idx = d, i
    if dmax <= eps:
        return [a, b]
    return _rdp(pts[: idx + 1], eps)[:-1] + _rdp(pts[idx:], eps)


def smooth_arc(corners, eps: float, iters: int) -> list[np.ndarray]:
    """RDP + Chaikin. Endpoints (junctions) fixed for open arcs; both the RDP
    (direction-independent) and Chaikin (direction-symmetric) steps yield an
    IDENTICAL polyline for the two regions sharing the arc → watertight."""
    pts = [np.asarray(c, float) for c in corners]
    if len(corners) >= 2 and corners[0] == corners[-1]:  # closed loop
        pts = pts[:-1]
        for _ in range(iters):
            out = []
            for i in range(len(pts)):
                p, nxt = pts[i], pts[(i + 1) % len(pts)]
                out += [0.75 * p + 0.25 * nxt, 0.25 * p + 0.75 * nxt]
            pts = out
        return pts + [pts[0]]
    pts = _rdp(pts, eps)
    for _ in range(iters):
        out = [pts[0]]
        for i in range(len(pts) - 1):
            p, q = pts[i], pts[i + 1]
            out += [0.75 * p + 0.25 * q, 0.25 * p + 0.75 * q]
        out.append(pts[-1])
        pts = out
    return pts


def assemble_faces(arcs, region_arcs, label) -> list[list[np.ndarray]]:
    """Walk `label`'s arcs into closed loops using the SHARED smoothed points."""
    unused = set(region_arcs.get(label, []))
    loops = []
    while unused:
        i = unused.pop()
        arc = arcs[i]
        if arc["corners"][0] == arc["corners"][-1]:
            loops.append(list(arc["smooth"]))
            continue
        start = arc["corners"][0]
        cur = arc["corners"][-1]
        pts = list(arc["smooth"])
        while cur != start:
            nxt, rev = None, False
            for j in unused:
                a = arcs[j]
                if a["corners"][0] == cur:
                    nxt, rev = j, False
                    break
                if a["corners"][-1] == cur:
                    nxt, rev = j, True
                    break
            if nxt is None:
                break
            unused.discard(nxt)
            a = arcs[nxt]
            seg = list(a["smooth"])[::-1] if rev else list(a["smooth"])
            pts.extend(seg[1:])
            cur = a["corners"][0] if rev else a["corners"][-1]
        loops.append(pts)
    return loops


# ---- smoothness dial + SVG ------------------------------------------------

def smoothness_to_params(smoothness: float) -> tuple[float, int]:
    """Map smoothness ∈ [0,1] to (rdp_eps, chaikin_iters)."""
    s = max(0.0, min(1.0, smoothness))
    return 0.5 + s * 2.0, 2 + int(round(s * 2))  # eps 0.5..2.5, iters 2..4


def _face_path_d(loops) -> str:
    return " ".join(
        "M " + " L ".join(f"{p[0]:.2f} {p[1]:.2f}" for p in loop) + " Z"
        for loop in loops if len(loop) >= 3
    )


def linerate_to_svg(
    img: Image.Image,
    line_thickness: float = 1.0,
    blur_amount: int = 2,
    smoothness: float = 0.6,
    num_colors: int = 12,
    min_radius: float = 8.0,
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    on_phase: callable | None = None,
) -> tuple[str, int, list[int]]:
    def phase(name):
        if on_phase is not None:
            on_phase(name)

    width, height = img.size
    prepared = quantise_image(img.filter(ImageFilter.GaussianBlur(blur_amount)) if blur_amount else img, num_colors)
    rgb = np.asarray(prepared)
    phase("quantise")

    labels, _ = _label_regions(rgb)
    labels = merge_small_regions(labels, min_radius)
    phase("segment")

    arcs, region_arcs = build_arcs(labels)
    eps, iters = smoothness_to_params(smoothness)
    for arc in arcs:
        arc["smooth"] = smooth_arc(arc["corners"], eps, iters)
    phase("smooth")

    # per-region mean colour → palette snap (same OKLab-nearest as lineart)
    ids = sorted(region_arcs)
    means = np.array([rgb[labels == rid].mean(0) for rid in ids], np.uint8)
    if palette_oklab is not None and palette_rgb is not None and len(ids):
        pal_ok = np.asarray(palette_oklab, np.float32)
        pal_rgb = np.asarray(palette_rgb, np.uint8)
        snap = nearest_palette_indices(rgb255_to_oklab(means), pal_ok)
        fills_rgb = pal_rgb[snap]
        pal_index = {rid: int(snap[i]) for i, rid in enumerate(ids)}
        palette_indices_used = sorted({int(v) for v in snap})
        label_map = build_label_map(np.asarray([pal_index[r] for r in ids], np.int32))
        number_of = {rid: label_map[pal_index[rid]] for rid in ids}
    else:
        fills_rgb = means
        palette_indices_used = []
        number_of = {rid: (i % 99) + 1 for i, rid in enumerate(ids)}

    regions, numbers = [], []
    for i, rid in enumerate(ids):
        loops = assemble_faces(arcs, region_arcs, rid)
        d = _face_path_d(loops)
        if not d:
            continue
        r, g, b = (int(v) for v in fills_rgb[i])
        regions.append(
            f'<path d="{d}" fill="#{r:02x}{g:02x}{b:02x}" stroke="black" '
            f'stroke-width="{line_thickness}" fill-rule="evenodd"/>'
        )
        mask = (labels == rid).astype(np.uint8)
        dt = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
        _, radius, _, (nx, ny) = cv2.minMaxLoc(dt)
        if radius > 0:
            fs = min(1.4 * min_radius, 24.0) if min_radius > 0 else min(1.4 * radius, 24.0)
            fs = min(fs, 1.4 * radius)
            numbers.append(
                f'<text x="{nx:.1f}" y="{ny:.1f}" font-size="{fs:.2f}" font-family="sans-serif" '
                f'text-anchor="middle" dominant-baseline="central" fill="black" '
                f'pointer-events="none">{number_of[rid]}</text>'
            )
    phase("compose")

    svg = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">\n'
        f'  <g id="regions">\n    {chr(10).join(regions)}\n  </g>\n'
        f'  <g id="numbers">\n    {chr(10).join(numbers)}\n  </g>\n'
        f'</svg>'
    )
    return svg, len(regions), palette_indices_used
