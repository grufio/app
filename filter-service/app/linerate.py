"""
Linerate filter pipeline — perceptual paint-by-numbers (P³).

Paint-by-numbers is a labelling problem, not a tracing one: the painted result
is a piecewise-constant image over a FIXED palette (the user's real paints). So
we make **colour == region** in one step, which makes the classic defects
(same-colour neighbours, same-colour nesting, noise splinters, duplicate
numbers) structurally impossible:

  L0 edge-preserving flatten → CSF saliency → select ≤K REAL paints from the
  fixed palette (perceptually weighted, no colours invented) → per-pixel paint
  assignment via a convex Potts relaxation (Chambolle-Pock, dependency-free) →
  paintability dissolve (inscribed-radius floor) → shared pixel-CRACK boundary
  graph → smooth each boundary ARC once (RDP + Chaikin, junction endpoints
  fixed) → assemble each region's face from the shared arcs → distance-transform
  number → SVG.

Because the label IS the palette index, two adjacent regions always differ in
colour by construction. The heavy front end runs at a capped WORKING resolution
and the vector coordinates are scaled back to the content pixels; the watertight
back half (`build_arcs` → `smooth_arc` → `assemble_faces`) is unchanged and
shared with the previous linerate.

Emits the same SVG contract as lineart (`<g id="regions">` with
`<path fill stroke d/>` + `<g id="numbers">`), so the editor's
`prepareTraceSvg` / `TraceInlineSvg` render it unchanged.
"""
from __future__ import annotations

import numpy as np
import cv2
from PIL import Image

from .oklab import nearest_palette_indices, rgb255_to_oklab
from .cell_labels import build_label_map, reconstruct_palette_indices
from .palette_reduction import reduce_to_top_n, restrict_palette_pam


# ---- tuning ---------------------------------------------------------------

_WORK_MAX_EDGE = 480     # cap the resolution the (heavy) labelling runs at
# Chambolle-Pock iterations are budget-scaled: iters = clip(BUDGET / (pixels ×
# labels), MIN, MAX). This bounds wall time on large images / high colour counts
# (the relaxation, not the dissolve, is the cost driver) while keeping the
# label argmax well-converged — halving the iterations barely moves the region
# count, so it costs time, not quality.
_RELAX_MAX_ITERS = 70    # fewer iters barely move the region count → detail-safe
_RELAX_MIN_ITERS = 40
_RELAX_BUDGET = 2.5e8    # tighter compute budget (belt + braces under the CPU cap)
_CSF_ALPHA = 6.0         # saliency weight on the data term (detail concentration)
_KMEANS_ITERS = 15
_KMEANS_SAMPLE = 12000   # subsample pixels for the palette-selection reduction


# ---- perceptual segmentation (P³) -----------------------------------------

def _flatten_to_lam(flatten: float) -> float:
    """Map flatten ∈ [0,1] → L0 smoothing strength (larger = flatter/painterly)."""
    f = max(0.0, min(1.0, flatten))
    return 0.002 + f * 0.045            # ~0.002 .. 0.047


def _detail_to_lam(detail: float) -> float:
    """Map detail ∈ [0,1] → Potts regularisation λ. LOW detail = strong
    smoothing = fewer/larger regions; HIGH detail = weaker = more regions."""
    d = max(0.0, min(1.0, detail))
    return 0.25 + (1.0 - d) * 2.75      # λ ~0.25 (fine) .. 3.0 (coarse)


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


def _saliency(okf: np.ndarray) -> np.ndarray:
    """CSF proxy: gradient magnitude of the blurred lightness — where the eye
    perceives detail. Normalised to [0, 1]."""
    Lb = cv2.GaussianBlur(okf[..., 0].astype(np.float32), (0, 0), 1.2)
    g = np.hypot(cv2.Sobel(Lb, cv2.CV_32F, 1, 0, 3), cv2.Sobel(Lb, cv2.CV_32F, 0, 1, 3))
    return (g / (g.max() + 1e-9)).astype(np.float32)


def _select_paints(okf_flat, rgb_flat, num_colors, pal_ok, pal_rgb, restriction, seed):
    """Choose ≤num_colors REAL paints from the fixed palette using the SAME shared,
    coverage/frequency-based reduction that pixelate/circulate use (no saliency
    bias — that bias under-represented smooth areas):
      - `pam`   → weighted k-medoids over the palette (`restrict_palette_pam`).
      - `top_n` → snap to the full palette, keep the most-used chips
                  (`reduce_to_top_n`), extract the distinct kept chips.
    Returns (sel_ok, sel_rgb, pal_index); pal_index[i] = full-palette index of
    paint i (−1 if no palette). Deterministic (top_n/PAM have no RNG). Without a
    palette (tests) falls back to plain unweighted k-means centroids."""
    K = max(2, int(num_colors))
    X = okf_flat.astype(np.float32)
    rng = np.random.default_rng(seed)
    # the reduction only needs a representative subset of pixels
    if len(X) > _KMEANS_SAMPLE:
        idx = rng.choice(len(X), _KMEANS_SAMPLE, replace=False)
        Xs, rgbs = X[idx], rgb_flat[idx]
    else:
        Xs, rgbs = X, rgb_flat

    if pal_ok is not None and pal_rgb is not None:
        if restriction == "pam":
            sel_ok, sel_rgb, kept = restrict_palette_pam(
                rgbs.reshape(-1, 1, 3), pal_ok, pal_rgb, K, distance_metric="oklab"
            )
            return np.asarray(sel_ok, np.float64), np.asarray(sel_rgb, np.uint8), np.asarray(kept, np.int32)
        # top_n: snap the subsample to the full palette, keep the top-K used chips
        snapped = pal_rgb[nearest_palette_indices(Xs, pal_ok)].reshape(-1, 1, 3)
        reduced, _ = reduce_to_top_n(snapped, pal_ok, pal_rgb, K, distance_metric="oklab")
        sel = np.unique(reconstruct_palette_indices(reduced, pal_rgb)).astype(np.int32)
        return pal_ok[sel], pal_rgb[sel], sel

    # no palette (tests only): plain k-means centroids as their own paints
    C = Xs[rng.choice(len(Xs), min(K, len(Xs)), replace=False)].copy()
    a = np.zeros(len(Xs), np.int64)
    for _ in range(_KMEANS_ITERS):
        a = (((Xs[:, None, :] - C[None, :, :]) ** 2).sum(2)).argmin(1)
        for k in range(len(C)):
            m = a == k
            if m.any():
                C[k] = Xs[m].mean(0)
    sel_rgb = np.zeros((len(C), 3), np.uint8)
    for k in range(len(C)):
        m = a == k
        if m.any():
            sel_rgb[k] = rgbs[m].mean(0)
    return C.astype(np.float64), sel_rgb, np.full(len(C), -1, np.int32)


def _project_simplex(V: np.ndarray) -> np.ndarray:
    """Project each row of V (N, L) onto the probability simplex (sum=1, ≥0)."""
    N, L = V.shape
    U = np.sort(V, axis=1)[:, ::-1]
    css = np.cumsum(U, axis=1) - 1.0
    ind = np.arange(1, L + 1)
    rho = ((U - css / ind) > 0).sum(1)
    theta = css[np.arange(N), rho - 1] / rho
    return np.maximum(V - theta[:, None], 0.0)


def _solve_potts(unary: np.ndarray, lam: float, iters: int) -> np.ndarray:
    """Per-pixel paint assignment as a convex Potts / piecewise-constant labelling,
    solved by Chambolle-Pock primal-dual (anisotropic-TV relaxation) in pure numpy.
    Returns the per-pixel argmax label. The 'adjacent regions differ in colour'
    guarantee holds for ANY rounding — it follows from label == palette index,
    not from optimality — so the relaxation needs no exact solver."""
    H, W, L = unary.shape
    f = unary.astype(np.float64)
    f = f / (f.std() + 1e-9)
    u = _project_simplex((-f).reshape(-1, L)).reshape(H, W, L)
    ub = u.copy()
    px = np.zeros((H, W, L))
    py = np.zeros((H, W, L))
    tau = sig = 1.0 / np.sqrt(8.0)
    for _ in range(iters):
        gx = np.zeros_like(ub)
        gy = np.zeros_like(ub)
        gx[:, :-1] = ub[:, 1:] - ub[:, :-1]
        gy[:-1, :] = ub[1:, :] - ub[:-1, :]
        px = np.clip(px + sig * gx, -lam, lam)
        py = np.clip(py + sig * gy, -lam, lam)
        dtx = np.zeros_like(px)
        dty = np.zeros_like(py)
        dtx[:, 0] = -px[:, 0]
        dtx[:, 1:-1] = px[:, :-2] - px[:, 1:-1]
        dtx[:, -1] = px[:, -2]
        dty[0, :] = -py[0, :]
        dty[1:-1, :] = py[:-2, :] - py[1:-1, :]
        dty[-1, :] = py[-2, :]
        un = _project_simplex((u - tau * (dtx + dty) - tau * f).reshape(-1, L)).reshape(H, W, L)
        ub = 2 * un - u
        u = un
    return u.argmax(2).astype(np.int32)


def _dissolve(P: np.ndarray, nsel: int, min_radius: float) -> np.ndarray:
    """Paintability: any connected region whose inscribed-circle radius <
    min_radius is absorbed into its majority-neighbour paint. Operates on the
    paint-index map so label == paint stays consistent; a dissolved region merges
    INTO a neighbour, so it never creates a same-colour boundary."""
    if min_radius <= 0:
        return P
    ring_k = np.ones((3, 3), np.uint8)
    for _ in range(8):  # safety cap; each round strictly shrinks region count
        changed = False
        newP = P.copy()
        for k in range(nsel):
            ncc, cc = cv2.connectedComponents((P == k).astype(np.uint8), connectivity=4)
            for c in range(1, ncc):
                mask = cc == c
                if cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 3).max() >= min_radius:
                    continue
                ring = cv2.dilate(mask.astype(np.uint8), ring_k) - mask.astype(np.uint8)
                nb = P[ring > 0]
                nb = nb[nb != k]
                if nb.size:
                    newP[mask] = np.bincount(nb).argmax()
                    changed = True
        P = newP
        if not changed:
            break
    return P


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
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    palette_restriction: str = "top_n",
    on_phase: callable | None = None,
) -> tuple[str, int, list[int]]:
    def phase(name):
        if on_phase is not None:
            on_phase(name)

    width, height = img.size
    rgb_full = img.convert("RGB")

    # --- working resolution: run the heavy labelling capped, scale vectors back ---
    scale = min(1.0, _WORK_MAX_EDGE / max(width, height))
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
    sal = _saliency(okf)
    weights = (1.0 + _CSF_ALPHA * sal.reshape(-1)).astype(np.float64)
    X = okf.reshape(-1, 3)
    rgb_flat = work.reshape(-1, 3)

    have_palette = palette_oklab is not None and palette_rgb is not None
    pal_ok = np.asarray(palette_oklab, np.float64) if have_palette else None
    pal_rgb = np.asarray(palette_rgb, np.uint8) if have_palette else None
    seed = int(work.astype(np.int64).sum() % (2 ** 32))   # deterministic per image
    # Paint SELECTION is coverage-based (shared with pixelate/circulate), no CSF
    # bias. The saliency `weights` stays only in the spatial unary term below.
    sel_ok, sel_rgb, sel_pal_index = _select_paints(
        X, rgb_flat, num_colors, pal_ok, pal_rgb, palette_restriction, seed
    )

    unary = ((((X[:, None, :] - sel_ok[None, :, :]) ** 2).sum(2)) * weights[:, None]).reshape(hh, ww, len(sel_ok))
    iters = int(np.clip(_RELAX_BUDGET / max(1, hh * ww * len(sel_ok)), _RELAX_MIN_ITERS, _RELAX_MAX_ITERS))
    P = _solve_potts(unary, _detail_to_lam(detail), iters)
    min_radius_work = min_radius * (ww / width)
    P = _dissolve(P, len(sel_ok), min_radius_work)
    labels, nreg, reg_sel = _labels_from_paint_map(P, len(sel_ok))
    phase("segment")

    # --- watertight shared-arc vectorisation (unchanged back half) ---
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
        mask = (labels == rid).astype(np.uint8)
        dt = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
        _, radius, _, (nx, ny) = cv2.minMaxLoc(dt)
        if radius > 0:
            rc = radius * sx                                   # work radius → content px
            fs = min(1.4 * min_radius, 24.0) if min_radius > 0 else min(1.4 * rc, 24.0)
            fs = min(fs, 1.4 * rc)
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
