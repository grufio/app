"""Unit tests for the perceptual (P³) linerate pipeline."""
from __future__ import annotations

import re
import warnings

import numpy as np
import pytest
from PIL import Image

from app.linerate import (
    build_arcs,
    smooth_arc,
    linerate_to_svg,
    _detail_to_min_area,
    _facet_has_width,
    _facet_merge,
    _label_font_size,
    _labels_from_paint_map,
    _rdp,
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


def test_rdp_large_arc_emits_no_runtime_warning():
    # NumPy's SIMD matmul spuriously trips a stale FP-error flag on the large
    # `ap @ ab` operand inside _rdp (same quirk as rgb_to_oklab). The span is
    # non-degenerate (l2 != 0) so the division is real and fine; _rdp silences
    # the noise via np.errstate. Assert a long arc stays clean.
    n = 6000
    xs = np.linspace(0, 500, n)
    pts = [np.array([x, np.sin(x / 7.0) * 3 + x * 0.6], float) for x in xs]
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        _rdp(pts, eps=0.5)  # must not raise


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


def test_detail_slider_maps_geometrically_to_min_area():
    # The Detail dialog slider steers the region count via min-area. Region count
    # scales ~1/frac, so frac is interpolated GEOMETRICALLY: min-area must shrink
    # strictly and by a ~constant ratio per equal detail step. Guards the "slider
    # felt dead until detail≈1" regression (a linear map bunched all growth at 1).
    work_px = 480 * 384
    areas = [_detail_to_min_area(d, work_px, 1.0) for d in (0.0, 0.25, 0.5, 0.75, 1.0)]
    assert all(a > b for a, b in zip(areas, areas[1:])), "min-area must shrink as detail rises"
    ratios = [areas[i] / areas[i + 1] for i in range(len(areas) - 1)]
    assert max(ratios) / min(ratios) < 1.05, "equal detail steps must scale min-area ~equally"


def test_detail_to_min_area_never_below_paintability_floor():
    # Even at max detail the min-area cannot drop below the inscribed-circle floor
    # of min_radius_work — tiny unpaintable slivers stay merged away.
    floor = np.pi * 6.0 ** 2
    assert _detail_to_min_area(1.0, 100, 6.0) == floor  # frac*work_px tiny -> floor wins


def test_facet_merge_absorbs_small_facets():
    # A small sliver of paint 2 between two big halves is below min_area and must
    # be merged into a neighbour; the two big paints survive.
    P = np.zeros((14, 15), np.int32)
    P[:, 7] = 2          # thin sliver
    P[:, 8:] = 1
    sel_ok = np.array([[0.2, 0, 0], [0.8, 0, 0], [0.21, 0, 0]], float)  # 2 is near 0
    labels, nreg, reg_sel = _facet_merge(P.copy(), 3, sel_ok, min_area=40)
    assert 2 not in reg_sel.tolist(), "sub-min facet must be merged away"


def test_facet_has_width_flags_thin_but_large_slivers():
    # Area does not imply width. A 1px-tall strip has a LARGE area (40) but a tiny
    # inscribed radius (~0.5) → it must fail the width test; a fat block passes.
    strip = np.zeros((20, 40), np.int32)
    strip[10, :] = 1
    has = _facet_has_width(strip, 2, min_radius_work=3.0)
    assert has[0] and not has[1], "a thin high-area strip must fail the width test"

    block = np.zeros((30, 30), np.int32)
    block[10:20, 10:20] = 1                       # 10x10 → inscribed radius ~5
    has = _facet_has_width(block, 2, min_radius_work=3.0)
    assert has[0] and has[1], "a fat block must pass the width test"


def test_facet_merge_enforces_min_width_gate():
    # A 1px-tall strip (paint 1, area 40) sits ABOVE the area floor, so without the
    # width gate it survives — the exact bug: a thin, un-paintable sliver. With the
    # gate it merges into its colour-nearest larger neighbour.
    P = np.zeros((20, 40), np.int32)
    P[10, :] = 1
    sel_ok = np.array([[0.2, 0, 0], [0.8, 0, 0]], float)
    _, _, off = _facet_merge(P.copy(), 2, sel_ok, min_area=5.0, min_radius_work=0.0)
    assert 1 in off.tolist(), "without the width gate a thin high-area strip survives"
    _, _, on = _facet_merge(P.copy(), 2, sel_ok, min_area=5.0, min_radius_work=3.0)
    assert 1 not in on.tolist(), "the width gate must merge the un-paintable strip away"

    # A paintable block (inscribed radius ~5 ≥ 3) must be KEPT by the width gate.
    P2 = np.zeros((30, 30), np.int32)
    P2[10:20, 10:20] = 1
    _, _, kept = _facet_merge(P2.copy(), 2, sel_ok, min_area=5.0, min_radius_work=3.0)
    assert 1 in kept.tolist(), "the width gate must keep a paintable block"


def test_facet_merge_keeps_zero_same_colour_adjacency():
    # Merging can create adjacent same-paint facets (paint 0 separates two paint-1
    # areas). The final re-CC MUST coalesce them → no two adjacent facets share a
    # paint. Guards against the same-colour-nesting defect returning.
    P = np.array(
        [[1, 1, 0, 1, 1],
         [1, 1, 0, 1, 1],
         [1, 1, 0, 1, 1]], np.int32,   # a thin paint-0 column splitting paint 1
    )
    sel_ok = np.array([[0.5, 0, 0], [0.5, 0, 0]], float)  # 0 and 1 similar → 0 merges into 1
    labels, nreg, reg_sel = _facet_merge(P.copy(), 2, sel_ok, min_area=10)
    for A, B in ((labels[:, :-1], labels[:, 1:]), (labels[:-1, :], labels[1:, :])):
        m = A != B
        assert np.all(reg_sel[A[m]] != reg_sel[B[m]]), "adjacent facets must differ in paint"


def _crown_paint_map(period=12, thick=3, H=96, W=96, seed=0):
    """A crown-like paint map: a fine field of BRIGHT paints (1..3, similar high
    OKLab-L) fragmented by a THICK, CONNECTED DARK lattice (paint 0). Mirrors the
    'blossoms against branches' structure that made the unaware merge percolate
    the connected dark net over the bright islands. Bright cells (period−thick)²
    sit above the paintability floor but are split into several bright-paint
    facets, so only the lightness-aware coalesce (M2) can grow them back to a
    paintable region before the dark absorbs them."""
    rng = np.random.default_rng(seed)
    P = rng.integers(1, 4, (H, W)).astype(np.int32)
    for i in range(0, H, period):
        P[i:i + thick, :] = 0
    for j in range(0, W, period):
        P[:, j:j + thick] = 0
    P[0, :] = 0; P[-1, :] = 0; P[:, 0] = 0; P[:, -1] = 0
    return P


# paint 0 = dark; paints 1..3 = bright (ΔL among them ≤ 0.08 ≤ threshold → "like";
# ΔL bright↔dark ≈ 0.6 > threshold → "unlike").
_CROWN_SEL_OK = np.array(
    [[0.20, 0.0, 0.0], [0.86, 0.02, 0.01], [0.82, -0.02, 0.03], [0.78, 0.01, -0.02]],
    float,
)


def _partition_ok(labels, nreg, reg_sel):
    ok = labels.min() >= 0 and labels.max() == nreg - 1 and len(np.unique(labels)) == nreg
    for A, B in ((labels[:, :-1], labels[:, 1:]), (labels[:-1, :], labels[1:, :])):
        m = A != B
        if np.any(reg_sel[A[m]] == reg_sel[B[m]]):
            return False   # same-paint neighbours = not a clean P³ partition
    return bool(ok)


def test_facet_merge_saves_bright_islands_from_dark_percolation():
    # THE crown-collapse gate. The old (lightness-unaware) merge lets a connected
    # dark network percolate over the rounds and swallow the bright islands → the
    # crown collapses to one near-black blob. The lightness-aware merge coalesces
    # like-L bright facets FIRST (M2) so the blossoms survive as paintable regions.
    P = _crown_paint_map()
    npx = P.size
    min_area = 40.0
    snap_bright = float((_CROWN_SEL_OK[P.ravel(), 0] > 0.673).sum()) / npx

    def bright_frac(labels, nreg, reg_sel):
        area = np.bincount(labels.ravel(), minlength=nreg)
        return float(area[_CROWN_SEL_OK[reg_sel, 0] > 0.673].sum()) / npx, area

    # baseline = the fix switched OFF (threshold so large every merge is "like" →
    # pure most-similar-neighbour merge, i.e. the pre-fix behaviour).
    lb, nb, rb = _facet_merge(P.copy(), 4, _CROWN_SEL_OK, min_area, l_threshold=1e9)
    lf, nf, rf = _facet_merge(P.copy(), 4, _CROWN_SEL_OK, min_area)
    base_bright, _ = bright_frac(lb, nb, rb)
    fix_bright, fix_area = bright_frac(lf, nf, rf)

    # 1. the unaware merge really collapses the crown (bright almost gone)…
    assert base_bright < 0.15, f"baseline should collapse bright, got {base_bright:.3f}"
    assert base_bright < snap_bright - 0.3, "there must be a real collapse to fix"
    # 2. …and the lightness-aware merge recovers it close to the post-snap level.
    assert fix_bright > base_bright + 0.3, f"fix must recover bright ({base_bright:.3f}→{fix_bright:.3f})"
    assert fix_bright >= 0.9 * snap_bright, f"fix should restore ~all bright ({fix_bright:.3f} vs snap {snap_bright:.3f})"
    # 3. the rescued regions are PAINTABLE — no sub-min_area splinters survive.
    assert (fix_area >= min_area).all(), "no region may stay below the paintability floor"
    bright_areas = fix_area[_CROWN_SEL_OK[rf, 0] > 0.673]
    assert bright_areas.size and np.median(bright_areas) >= min_area, "rescued bright regions must be paintable"
    # 4. output stays a clean watertight partition (no same-paint adjacency).
    assert _partition_ok(lf, nf, rf), "fix output must be a watertight P³ partition"


def test_facet_merge_no_regression_on_isolated_unpaintable_speck():
    # Guard the other side: an ISOLATED bright speck below the floor, surrounded
    # only by a large dark region, has no like-L neighbour to grow into — it must
    # still merge away exactly like the baseline (the fix preserves paintable
    # clusters, NOT unpaintable single specks). fix ≡ baseline here.
    P = np.zeros((48, 48), np.int32)     # paint 0 = dark everywhere
    P[:, :24] = 1                        # left half = bright paint 1 (large)
    P[2:6, 40:44] = 2                    # a 16px bright speck marooned in the dark
    min_area = 40.0
    lb, nb, rb = _facet_merge(P.copy(), 3, _CROWN_SEL_OK[:3], min_area, l_threshold=1e9)
    lf, nf, rf = _facet_merge(P.copy(), 3, _CROWN_SEL_OK[:3], min_area)

    def bright_frac(labels, nreg, reg_sel):
        area = np.bincount(labels.ravel(), minlength=nreg)
        return float(area[_CROWN_SEL_OK[:3][reg_sel, 0] > 0.673].sum()) / P.size

    assert abs(bright_frac(lb, nb, rb) - bright_frac(lf, nf, rf)) < 1e-9, "fix must be a no-op on a coarse image"
    assert 2 not in rf.tolist(), "the isolated unpaintable speck must still merge away"


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


def test_labels_are_not_clipped_by_the_image_edge():
    # Vertical stripes touch the top/bottom edges; the label pole must inset from
    # the frame (padded distance transform) so the number isn't cut off.
    cols = [(200, 60, 60), (60, 200, 60), (60, 60, 200), (220, 220, 60)]
    arr = np.zeros((20, 40, 3), np.uint8)
    for k, c in enumerate(cols):
        arr[:, k * 10:(k + 1) * 10] = c
    img = Image.fromarray(arr, "RGB")
    pal_ok, pal_rgb = _mini_palette(cols)
    svg, _, _ = linerate_to_svg(
        img, flatten=0.1, detail=0.8, num_colors=6, min_radius=2.0,
        palette_oklab=pal_ok, palette_rgb=pal_rgb,
    )
    W, H = 40, 20
    found = False
    for m in re.finditer(r'<text x="([\d.]+)" y="([\d.]+)" font-size="([\d.]+)"[^>]*>(\d+)</text>', svg):
        found = True
        x, y, fs, num = float(m[1]), float(m[2]), float(m[3]), m[4]
        hw, hh = 0.3 * fs * len(num), 0.5 * fs
        assert x - hw >= -0.01 and x + hw <= W + 0.01, f"label {num} clipped horizontally at x={x}"
        assert y - hh >= -0.01 and y + hh <= H + 0.01, f"label {num} clipped vertically at y={y}"
    assert found, "expected at least one label"


def test_label_font_shrinks_for_more_digits_and_fits_the_inscribed_circle():
    # 2-digit labels were spilling over the region edge. The font must shrink with
    # digit count so the digit box stays inside the region's inscribed circle.
    rc = 10.0
    one = _label_font_size(0.0, rc, 1)
    two = _label_font_size(0.0, rc, 2)
    assert two < one, "a 2-digit label must be smaller than a 1-digit one at equal radius"
    for ndig, fs in ((1, one), (2, two)):
        half_diag = np.hypot(0.3 * fs * ndig, 0.5 * fs)  # digit-box corner from centre
        assert half_diag <= rc + 1e-9, "label must fit inside the inscribed circle"


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
