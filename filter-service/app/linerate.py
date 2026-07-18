"""
Linerate filter pipeline — perceptual paint-by-numbers (P³).

Paint-by-numbers is a labelling problem, not a tracing one: the painted result
is a piecewise-constant image over a FIXED palette (the user's real paints). So
we make **colour == region** in one step, which makes the classic defects
(same-colour neighbours, same-colour nesting, noise splinters, duplicate
numbers) structurally impossible:

  L0 edge-preserving flatten → select ≤K REAL paints from the fixed palette
  (coverage-based, shared with pixelate/circulate, no colours invented) → snap
  each pixel to its nearest selected paint → connected-component FACETS →
  merge every facet below the min area into its most similar-coloured neighbour
  (drake7707-style, iterate to convergence) → re-label the merged paint map →
  shared pixel-CRACK boundary graph → smooth each boundary ARC once (RDP +
  Chaikin, junction endpoints fixed) → assemble faces → distance-transform
  number → SVG.

The facet merge replaced an earlier convex Potts relaxation, which was clean but
timed out on Cloud Run (numpy heavy). The merge is a specialised segmentation
step: ~10-80× faster and just as clean, no dependency, no optimiser.

Because the label IS the palette index (guaranteed by the final re-labelling of
the merged paint map), two adjacent regions always differ in colour by
construction. The front end runs at a capped WORKING resolution and the vector
coordinates are scaled back to the content pixels; the watertight back half
(`build_arcs` → `smooth_arc` → `assemble_faces`) is unchanged.

Emits the paint-by-numbers SVG contract (`<g id="regions">` with
`<path fill stroke d/>` + `<g id="numbers">`), so the editor's
`prepareTraceSvg` / `TraceInlineSvg` render it unchanged.
"""
from __future__ import annotations

import numpy as np
import cv2
from PIL import Image

from .oklab import nearest_palette_indices, rgb255_to_oklab
from .cell_labels import build_label_map
from .palette_reduction import select_paints


# ---- tuning ---------------------------------------------------------------

_WORK_MAX_EDGE = 480     # cap the resolution the labelling runs at
_FACET_MERGE_ROUNDS = 40  # safety cap; area-merge converges in a few rounds
# `detail` ∈ [0,1] widens the facet min-area above the paintability floor:
# high detail → floor (many small facets), low detail → coarse (few big facets).
_DETAIL_MIN_FRAC = 0.0001   # min facet area as fraction of the image at detail=1
_DETAIL_MAX_FRAC = 0.003    # ... at detail=0
# Lightness-aware facet merge (crown-collapse fix). A sub-min_area facet first
# tries to coalesce with a like-lightness larger neighbour (M2) and only merges
# into an unlike-lightness neighbour as a penalised last resort (M1). Stops the
# connected dark structure (branches) from percolating over the merge rounds and
# swallowing paintable bright islands (blossoms) into one near-black blob.
_MERGE_L_THRESHOLD = 0.20   # OKLab-L gap separating "like" from "unlike" lightness
_MERGE_L_PENALTY = 10.0     # distance added to an unlike-L target (≫ OKLab² spread)
# The width test (inscribed-disk paintability) uses a SMALLER radius than the
# min_area floor: `width_radius_frac` × min_radius. The full radius merged every
# stroke thinner than the Min-Gap *width*, over-merging paintable fine strokes (a
# long ~1.5 mm stroke is paintable yet fails a 2 mm inscribed disk). Exposed as the
# "Radius" dial; this is its DEFAULT — 0.333 ≈ the analysed knee where region growth
# plateaus. The min_area floor + uniform number sizing keep the full min_radius.
_WIDTH_MIN_RADIUS_FRAC = 0.333


# ---- perceptual segmentation (P³) -----------------------------------------

def _flatten_to_lam(flatten: float) -> float:
    """Map flatten ∈ [0,1] → L0 smoothing strength (larger = flatter/painterly)."""
    f = max(0.0, min(1.0, flatten))
    return 0.002 + f * 0.045            # ~0.002 .. 0.047


def _detail_to_min_area(detail: float, work_px: int, min_radius_work: float) -> float:
    """Map detail ∈ [0,1] → facet min-area. HIGH detail = small area = more, finer
    facets; LOW detail = large area = fewer, bolder facets. Never below the
    paintability floor (the inscribed circle of `min_radius_work`).

    Region count scales like 1/frac, so `frac` is interpolated GEOMETRICALLY
    (not linearly) across the slider — each equal step of `detail` changes the
    count by a roughly constant ratio. A linear frac made the slider feel dead
    until detail≈1 (all the region growth bunched at the very top)."""
    d = max(0.0, min(1.0, detail))
    frac = _DETAIL_MAX_FRAC * (_DETAIL_MIN_FRAC / _DETAIL_MAX_FRAC) ** d
    floor = np.pi * float(min_radius_work) ** 2
    return max(floor, frac * work_px)


def _l0_smooth(img_u8: np.ndarray, lam: float, kappa: float = 2.0) -> np.ndarray:
    """L0 gradient minimisation (Xu et al. 2011) — edge-preserving flattening.
    Pure numpy FFT (no dependency). Removes texture/noise while keeping strong
    edges crisp so region boundaries land on real contours, not on noise."""
    S = img_u8.astype(np.float64) / 255.0
    N, M, _ = S.shape

    def psf2otf(psf, shape):
        kh, kw = psf.shape
        pad = np.zeros(shape)
        pad[:kh, :kw] = psf
        pad = np.roll(pad, -(kh // 2), 0)
        pad = np.roll(pad, -(kw // 2), 1)
        return np.fft.fft2(pad)

    otfx = psf2otf(np.array([[1, -1]]), (N, M))
    otfy = psf2otf(np.array([[1], [-1]]), (N, M))
    Normin1 = np.fft.fft2(S, axes=(0, 1))
    Den2 = (np.abs(otfx) ** 2 + np.abs(otfy) ** 2)[:, :, None]
    beta = 2 * lam
    while beta < 1e5:
        Den = 1 + beta * Den2
        h = np.concatenate([np.diff(S, 1, 1), S[:, :1, :] - S[:, -1:, :]], 1)
        v = np.concatenate([np.diff(S, 1, 0), S[:1, :, :] - S[-1:, :, :]], 0)
        idx = (h ** 2 + v ** 2).sum(2) < (lam / beta)
        h[idx] = 0
        v[idx] = 0
        hd = np.concatenate([h[:, -1:, :] - h[:, :1, :], -np.diff(h, 1, 1)], 1)
        vd = np.concatenate([v[-1:, :, :] - v[:1, :, :], -np.diff(v, 1, 0)], 0)
        FS = (Normin1 + beta * np.fft.fft2(hd + vd, axes=(0, 1))) / Den
        S = np.real(np.fft.ifft2(FS, axes=(0, 1)))
        beta *= kappa
    return np.clip(S, 0.0, 1.0) * 255.0


def _facet_adjacency(labels: np.ndarray, nreg: int):
    """Unique unordered adjacent facet-label pairs (vectorised)."""
    keys = []
    for A, B in ((labels[:, :-1], labels[:, 1:]), (labels[:-1, :], labels[1:, :])):
        m = A != B
        a = A[m].astype(np.int64)
        b = B[m].astype(np.int64)
        lo = np.minimum(a, b)
        hi = np.maximum(a, b)
        keys.append(lo * nreg + hi)
    if not keys:
        return np.empty(0, np.int32), np.empty(0, np.int32)
    u = np.unique(np.concatenate(keys))
    return (u // nreg).astype(np.int32), (u % nreg).astype(np.int32)


def _facet_has_width(labels: np.ndarray, nreg: int, min_radius_work: float) -> np.ndarray:
    """Per-facet paintability-by-WIDTH test (vectorised, one EDT per call).

    A facet is paintable only if it CONTAINS an inscribed disk of radius
    `min_radius_work` — i.e. some interior pixel sits at least that far from the
    facet's own boundary. Area alone doesn't imply width: a long thin sliver
    clears the `min_area` floor yet is too narrow to paint. Build the label-
    boundary mask (a pixel whose 4-neighbour is a different facet, plus the image
    edge), take the Euclidean distance transform to that boundary, and flag every
    facet owning at least one pixel that far in. Returns a bool array (nreg,).
    No per-facet Python loop — keeps the merge round vectorised (Cloud-Run hotspot).
    """
    diff_h = labels[:, :-1] != labels[:, 1:]
    diff_v = labels[:-1, :] != labels[1:, :]
    boundary = np.zeros(labels.shape, bool)
    boundary[:, :-1] |= diff_h
    boundary[:, 1:] |= diff_h
    boundary[:-1, :] |= diff_v
    boundary[1:, :] |= diff_v
    boundary[0, :] = boundary[-1, :] = boundary[:, 0] = boundary[:, -1] = True
    edt = cv2.distanceTransform((~boundary).astype(np.uint8), cv2.DIST_L2, 3)
    has = np.zeros(nreg, bool)
    wide = edt >= float(min_radius_work)
    if wide.any():
        has[np.unique(labels[wide])] = True
    return has


def _facet_merge(
    P: np.ndarray,
    nsel: int,
    sel_ok: np.ndarray,
    min_area: float,
    l_threshold: float = _MERGE_L_THRESHOLD,
    l_penalty: float = _MERGE_L_PENALTY,
    min_radius_work: float = 0.0,
):
    """drake7707-style region cleanup. Connected-component facets of the paint
    map, then merge every facet below `min_area` — or, when `min_radius_work > 0`,
    any facet narrower than that inscribed-disk radius (a thin sliver, however
    long) — into a neighbour, iterating to convergence — clean regions without an
    optimiser.

    Merge admissibility is LIGHTNESS-AWARE, to stop a connected dark structure
    from percolating over the rounds and swallowing paintable bright islands (the
    "blossoms against branches" crown-collapse — bright halved 32 %→15 % in the
    unaware merge, measured):
      - M2 (coalesce first): a sub-`min_area` facet whose OKLab-L is close
        (≤`l_threshold`) to a strictly-larger neighbour merges into it FIRST, so
        like-lightness clusters (a patch of blossoms) grow toward `min_area`
        before ever being offered to an unlike-lightness target.
      - M1 (soft penalty): any remaining sub-`min_area` facet still merges into
        its most-similar strictly-larger neighbour, but an unlike-L target
        (gap > `l_threshold`) is penalised by `l_penalty` (≫ the OKLab² spread),
        so a bright facet is absorbed by dark branches only as a last resort —
        never leaving an un-paintable sub-`min_area` splinter behind.

    A final re-labelling of the merged paint map coalesces any now-adjacent
    same-paint facets, so 'adjacent regions differ in colour' holds by
    construction. Returns (labels, nreg, reg_sel) like `_labels_from_paint_map`.
    Fully VECTORISED per round (no per-facet Python loop — that was the Cloud-Run
    hotspot): merges are oriented strictly into the LARGER facet (tie: smaller id)
    so the target graph is a forest (acyclic) and chains resolve by vectorised
    pointer-jumping — no 2-cycle oscillation."""
    sel_L = sel_ok[:, 0]  # OKLab-L per paint
    labels, nreg, facet_sel = _labels_from_paint_map(P, nsel)

    def _resolve_and_apply(tgt: np.ndarray) -> None:
        nonlocal labels, facet_sel, nreg
        for _ in range(int(np.ceil(np.log2(max(2, nreg)))) + 1):  # resolve chains
            tgt = tgt[tgt]
        labels = tgt[labels]
        ids = np.unique(labels)
        remap = np.zeros(int(ids.max()) + 1, np.int32)
        remap[ids] = np.arange(len(ids))
        labels = remap[labels]
        facet_sel = facet_sel[ids]
        nreg = len(ids)

    def _best_target(s: np.ndarray, t: np.ndarray, dd: np.ndarray) -> np.ndarray:
        """min-distance strictly-larger target per source facet → tgt map."""
        order = np.lexsort((dd, s))
        s_o, t_o = s[order], t[order]
        first = np.empty(s_o.size, bool)
        first[0] = True
        first[1:] = s_o[1:] != s_o[:-1]
        tgt = np.arange(nreg)
        tgt[s_o[first]] = t_o[first]
        return tgt

    for _ in range(_FACET_MERGE_ROUNDS):
        area = np.bincount(labels.ravel(), minlength=nreg).astype(np.int64)
        # A facet needs merging if it's below the detail-driven area floor OR —
        # when a paintability width is set — it holds no inscribed disk of radius
        # `min_radius_work` (a thin sliver, however large its area). Width is the
        # real paintability limit; area alone lets long slivers survive.
        too_small = area < min_area
        if min_radius_work > 0.0:
            too_small = too_small | ~_facet_has_width(labels, nreg, min_radius_work)
        if not too_small.any():
            break
        pa, pb = _facet_adjacency(labels, nreg)
        if pa.size == 0:
            break
        # directed edges both ways; distance = OKLab² between the two paints
        src = np.concatenate([pa, pb])
        dst = np.concatenate([pb, pa])
        fok = sel_ok[facet_sel]
        dist = ((fok[src] - fok[dst]) ** 2).sum(1)
        dL = np.abs(sel_L[facet_sel[src]] - sel_L[facet_sel[dst]])
        # every merge points to a strictly-larger node (tie → smaller id) →
        # forest → acyclic → pointer-jumping converges.
        larger = (area[dst] > area[src]) | ((area[dst] == area[src]) & (dst < src))
        small = too_small[src]

        # M2 — coalesce like-lightness small facets first (one growth generation
        # per round, adjacency recomputed after). Bright clusters reach min_area
        # before M1 can hand them to a dark neighbour.
        like = small & larger & (dL <= l_threshold)
        if like.any():
            _resolve_and_apply(_best_target(src[like], dst[like], dist[like]))
            continue

        # M1 — remaining small facets merge into the most-similar larger neighbour;
        # an unlike-L target is penalised so dark branches absorb a bright facet
        # only as a last resort (still guarantees no sub-min_area facet survives).
        keep = small & larger
        if not keep.any():
            break
        pdist = dist + l_penalty * (dL > l_threshold).astype(dist.dtype)
        _resolve_and_apply(_best_target(src[keep], dst[keep], pdist[keep]))
    # final re-CC on the merged paint map → adjacent facets always differ in paint
    return _labels_from_paint_map(facet_sel[labels], nsel)


def _labels_from_paint_map(P: np.ndarray, nsel: int) -> tuple[np.ndarray, int, np.ndarray]:
    """Connected components of the paint-index map → globally-unique region ids,
    plus the paint (sel) index of every region. Because each region is a connected
    same-paint area, its paint index is well defined."""
    h, w = P.shape
    labels = np.full((h, w), -1, np.int32)
    reg_sel: list[int] = []
    nxt = 0
    for k in range(nsel):
        ncc, cc = cv2.connectedComponents((P == k).astype(np.uint8), connectivity=4)
        if ncc <= 1:
            continue
        m = cc > 0
        labels[m] = cc[m] - 1 + nxt
        reg_sel.extend([k] * (ncc - 1))
        nxt += ncc - 1
    return labels, nxt, np.array(reg_sel, np.int32)


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
    """Ramer-Douglas-Peucker — the max-distance search over interior points is
    ONE numpy op per recursion level (was a per-point Python loop). Same result."""
    if len(pts) < 3:
        return pts
    P = np.asarray(pts, float)
    a, b = P[0], P[-1]
    ab = b - a
    l2 = float(ab @ ab)
    ap = P[1:-1] - a
    if l2 == 0.0:
        d = np.hypot(ap[:, 0], ap[:, 1])
    else:
        # np.errstate: the `ap @ ab` matmul spuriously trips a stale FP-error
        # flag on large point arrays (same NumPy quirk as rgb_to_oklab — "divide
        # by zero in matmul" is impossible for a multiply-add). Inputs are finite
        # and l2 != 0 here, so the warnings are pure Cloud Run stderr noise;
        # silencing them leaves the output unchanged.
        with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
            r = ap - np.clip((ap @ ab) / l2, 0.0, 1.0)[:, None] * ab
        d = np.hypot(r[:, 0], r[:, 1])
    idx = int(d.argmax()) + 1
    if d[idx - 1] <= eps:
        return [a, b]
    return _rdp(pts[: idx + 1], eps)[:-1] + _rdp(pts[idx:], eps)


def _chaikin_open(p: np.ndarray, iters: int) -> np.ndarray:
    for _ in range(iters):
        q1 = 0.75 * p[:-1] + 0.25 * p[1:]
        q2 = 0.25 * p[:-1] + 0.75 * p[1:]
        inner = np.empty((2 * (len(p) - 1), 2))
        inner[0::2] = q1
        inner[1::2] = q2
        p = np.vstack([p[:1], inner, p[-1:]])
    return p


def smooth_arc(corners, eps: float, iters: int) -> list[np.ndarray]:
    """RDP + Chaikin, vectorised (numpy per arc, no per-point Python loop — that
    was a Cloud-Run hotspot). Endpoints (junctions) fixed for open arcs; the
    direction-independent RDP and direction-symmetric Chaikin yield an IDENTICAL
    polyline for the two regions sharing the arc → watertight. Same output points
    as before. Returns a list of (x, y) points."""
    P = np.asarray(corners, float)
    if len(corners) >= 2 and corners[0] == corners[-1]:  # closed loop
        p = P[:-1]
        for _ in range(iters):
            nxt = np.roll(p, -1, axis=0)
            q1 = 0.75 * p + 0.25 * nxt
            q2 = 0.25 * p + 0.75 * nxt
            out = np.empty((2 * len(p), 2))
            out[0::2] = q1
            out[1::2] = q2
            p = out
        return list(p) + [p[0]]
    p = np.asarray(_rdp(list(P), eps), float)
    return list(_chaikin_open(p, iters))


def assemble_faces(arcs, region_arcs, label) -> list[list[np.ndarray]]:
    """Walk `label`'s arcs into closed loops using the SHARED smoothed points.
    Uses a junction→arcs index so the next arc at a corner is an O(degree)
    lookup, not an O(remaining-arcs) scan (which was O(arcs²) per region)."""
    idxs = region_arcs.get(label, [])
    ends: dict[tuple[int, int], list[int]] = {}
    loops = []
    unused = set(idxs)
    for i in idxs:
        c = arcs[i]["corners"]
        if c[0] == c[-1]:
            continue  # pure closed loop, handled below
        ends.setdefault(c[0], []).append(i)
        ends.setdefault(c[-1], []).append(i)
    # closed loops first
    for i in idxs:
        c = arcs[i]["corners"]
        if c[0] == c[-1] and i in unused:
            unused.discard(i)
            loops.append(list(arcs[i]["smooth"]))
    while unused:
        i = next(iter(unused))
        unused.discard(i)
        start = arcs[i]["corners"][0]
        cur = arcs[i]["corners"][-1]
        pts = list(arcs[i]["smooth"])
        while cur != start:
            nxt, rev = None, False
            for j in ends.get(cur, ()):
                if j not in unused:
                    continue
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


def _label_font_size(min_radius: float, rc: float, ndigits: int) -> float:
    """Font size (content px) for a region label with `ndigits` digits sitting in
    an inscribed circle of radius `rc`. Beyond the radius/`min_radius` caps, the
    number's DIGIT BOX (≈0.6·fs per digit wide) must fit inside the circle, or a
    2-digit label spills over the region edge (the main cause of labels landing
    outside / under the outline)."""
    fs = min(1.4 * min_radius, 24.0) if min_radius > 0 else min(1.4 * rc, 24.0)
    fit = 1.8 * rc / float(np.hypot(0.6 * max(1, ndigits), 1.0))
    return min(fs, 1.4 * rc, fit)


def _face_path_d(loops, sx: float = 1.0, sy: float = 1.0) -> str:
    """SVG path `d` for a region's loops. `sx`/`sy` scale the working-resolution
    coordinates back to the content pixel space."""
    return " ".join(
        "M " + " L ".join(f"{p[0] * sx:.2f} {p[1] * sy:.2f}" for p in loop) + " Z"
        for loop in loops if len(loop) >= 3
    )


def linerate_to_svg(
    img: Image.Image,
    line_thickness: float = 1.0,
    flatten: float = 0.4,
    detail: float = 0.5,
    num_colors: int = 16,
    smoothness: float = 0.6,
    min_radius: float = 8.0,
    width_radius_frac: float = _WIDTH_MIN_RADIUS_FRAC,
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    palette_restriction: str = "top_n",
    work_edge: int = _WORK_MAX_EDGE,
    on_phase: callable | None = None,
) -> tuple[str, int, list[int]]:
    def phase(name):
        if on_phase is not None:
            on_phase(name)

    width, height = img.size
    rgb_full = img.convert("RGB")

    # --- working resolution: run the heavy labelling capped, scale vectors back ---
    scale = min(1.0, max(1, int(work_edge)) / max(width, height))
    if scale < 1.0:
        ww = max(1, round(width * scale))
        hh = max(1, round(height * scale))
        work = np.asarray(rgb_full.resize((ww, hh), Image.LANCZOS))
    else:
        work = np.asarray(rgb_full)
        hh, ww = work.shape[:2]
    sx = width / ww
    sy = height / hh

    # --- P³ front end (colour == region) ---
    flat = _l0_smooth(work, _flatten_to_lam(flatten))
    phase("flatten")

    okf = rgb255_to_oklab(flat)                       # (hh, ww, 3)
    X = okf.reshape(-1, 3)
    rgb_flat = work.reshape(-1, 3)

    have_palette = palette_oklab is not None and palette_rgb is not None
    pal_ok = np.asarray(palette_oklab, np.float64) if have_palette else None
    pal_rgb = np.asarray(palette_rgb, np.uint8) if have_palette else None
    seed = int(work.astype(np.int64).sum() % (2 ** 32))   # deterministic per image
    # Paint SELECTION is coverage-based (shared with pixelate/circulate).
    sel_ok, sel_rgb, sel_pal_index = select_paints(
        X, rgb_flat, num_colors, pal_ok, pal_rgb, palette_restriction, seed
    )

    # Snap each pixel to its nearest selected paint, then merge tiny facets into
    # their most similar-coloured neighbour (drake7707-style) — clean regions
    # without an optimiser, and fast enough for Cloud Run (the convex relaxation
    # timed out there). min_area = the paintability floor, widened by `detail`.
    min_radius_work = min_radius * (ww / width)
    min_area = _detail_to_min_area(detail, hh * ww, min_radius_work)
    return _paint_map_to_svg(
        X, hh, ww, width, height, sx, sy, sel_ok, sel_rgb, sel_pal_index,
        have_palette, min_area, smoothness, line_thickness, min_radius,
        width_radius_frac, phase,
    )


def _paint_map_to_svg(
    X, hh, ww, width, height, sx, sy, sel_ok, sel_rgb, sel_pal_index,
    have_palette, min_area, smoothness, line_thickness, min_radius,
    width_radius_frac, phase,
):
    """Back-half of the linerate segmentation: snap every pixel to its nearest
    SELECTED paint, merge sub-`min_area` facets into the most similar-coloured
    neighbour (colour-preserving), vectorise via watertight shared arcs, and place
    one distance-transform number per region. The CALLER decides the paint set +
    `min_area` — linerate reduces to a `num_colors` budget with a `detail`-widened
    floor."""
    P = nearest_palette_indices(X, sel_ok).reshape(hh, ww).astype(np.int32)
    # Paintability is enforced by WIDTH, not just area: a region must hold an
    # inscribed disk before it counts as paintable. The width radius is `width_radius_frac`
    # (the "Radius" dial) × the Min-Gap radius, so only clearly-too-thin slivers merge —
    # moderately thin but paintable strokes survive (over-merge fix). The min_area floor
    # keeps the full radius (baked into `min_area` by the caller).
    min_radius_work = min_radius * (ww / width)
    labels, nreg, reg_sel = _facet_merge(
        P, len(sel_ok), sel_ok, min_area,
        min_radius_work=min_radius_work * width_radius_frac,
    )
    phase("segment")

    # --- watertight shared-arc vectorisation ---
    arcs, region_arcs = build_arcs(labels)
    eps, iters = smoothness_to_params(smoothness)
    for arc in arcs:
        arc["smooth"] = smooth_arc(arc["corners"], eps, iters)
    phase("smooth")

    ids = sorted(region_arcs)
    if have_palette and len(ids):
        region_palidx = sel_pal_index[reg_sel]                 # region → full palette index
        used = np.asarray([region_palidx[r] for r in ids], np.int32)
        label_map = build_label_map(used)
        palette_indices_used = sorted({int(v) for v in used})
        number_of = {rid: label_map[int(region_palidx[rid])] for rid in ids}
    else:
        palette_indices_used = []
        number_of = {rid: (i % 99) + 1 for i, rid in enumerate(ids)}

    regions, numbers = [], []
    for rid in ids:
        loops = assemble_faces(arcs, region_arcs, rid)
        d = _face_path_d(loops, sx, sy)
        if not d:
            continue
        r, g, b = (int(v) for v in sel_rgb[reg_sel[rid]])
        regions.append(
            f'<path d="{d}" fill="#{r:02x}{g:02x}{b:02x}" stroke="black" '
            f'stroke-width="{line_thickness}" fill-rule="evenodd"/>'
        )
        # Place the label at the pole of inaccessibility of the RENDERED (smoothed)
        # face, not the raster label mask — smoothing shifts the boundary, so the
        # mask pole landed outside / under the drawn region. Even-odd rasterise
        # (XOR per loop) so a face with a hole is excluded correctly.
        fmask = np.zeros((hh, ww), np.uint8)
        for lp in loops:
            if len(lp) < 3:
                continue
            one = np.zeros((hh, ww), np.uint8)
            cv2.fillPoly(one, [np.round(np.asarray(lp)).astype(np.int32)], 1)
            fmask ^= one
        # Pad a zero border so the IMAGE EDGE counts as a boundary too — the pole
        # then insets from the frame and a border-hugging label can't be clipped.
        padded = cv2.copyMakeBorder(fmask, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
        dt = cv2.distanceTransform(padded, cv2.DIST_L2, 5)
        _, radius, _, (px, py) = cv2.minMaxLoc(dt)
        nx, ny = px - 1, py - 1
        if radius > 0:
            rc = radius * sx                                   # work radius → content px
            fs = _label_font_size(min_radius, rc, len(str(number_of[rid])))
            numbers.append(
                f'<text x="{nx * sx:.1f}" y="{ny * sy:.1f}" font-size="{fs:.2f}" font-family="sans-serif" '
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
