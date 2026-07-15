"""Unit tests for the rebuilt lineart pipeline (full-palette, max paintable detail).

lineart now shares linerate's segmentation core: full-palette snap → colour-
preserving merge → watertight arcs → one number per region. No colour reduction
(no num_colors, no palette selection, no vtracer). These tests pin the two
properties the old pipeline violated: the full palette pool survives (colour ==
region, only the paintability floor removes chips), and every region is numbered.
"""
from __future__ import annotations

import re

import numpy as np

from app.lineart import lineart_to_svg
from app.oklab import rgb255_to_oklab


def _palette(rgbs):
    """(oklab list, rgb list) for a set of distinct RGB chips."""
    rgb = [list(c) for c in rgbs]
    ok = [list(rgb255_to_oklab(np.array([c], np.uint8))[0]) for c in rgbs]
    return ok, rgb


def _blocks_image(rgbs, block=48, cols=6):
    """An image of well-separated, paintable-sized colour blocks — one per chip."""
    n = len(rgbs)
    rows = (n + cols - 1) // cols
    arr = np.zeros((rows * block, cols * block, 3), np.uint8)
    for k, c in enumerate(rgbs):
        r, cc = divmod(k, cols)
        arr[r * block:(r + 1) * block, cc * block:(cc + 1) * block] = c
    from PIL import Image
    return Image.fromarray(arr, "RGB")


# A spread of 12 clearly-distinct chips.
_RGBS = [
    (200, 40, 40), (40, 200, 40), (40, 40, 200), (220, 220, 40),
    (40, 220, 220), (220, 40, 220), (240, 140, 40), (140, 40, 240),
    (40, 140, 60), (120, 90, 60), (230, 230, 230), (30, 30, 30),
]


def _fills(svg):
    return set(re.findall(r'fill="(#[0-9a-fA-F]{6})"', svg))


def test_lineart_preserves_the_full_pool():
    """THE proof the old pipeline failed (it collapsed 40→5 / 84→17): with N
    distinct, paintable-sized colour blocks against a palette that contains those
    N chips, ALL N survive in palette_indices_used — colour == region, nothing is
    reduced before or during the trace."""
    pal_ok, pal_rgb = _palette(_RGBS)
    img = _blocks_image(_RGBS)
    svg, nreg, used = lineart_to_svg(
        img, line_thickness=1.0, blur_amount=0, smoothness=0.4,
        palette_oklab=pal_ok, palette_rgb=pal_rgb, min_radius=4.0, work_edge=512,
    )
    assert len(used) == len(_RGBS), f"expected all {len(_RGBS)} chips, got {len(used)}"
    # every emitted fill is a real palette chip
    palette_hex = {f"#{r:02x}{g:02x}{b:02x}" for r, g, b in pal_rgb}
    assert _fills(svg) <= palette_hex and _fills(svg)


def test_lineart_numbers_every_region():
    """Numbers are mandatory (the app makes no sense without them): every region
    in <g id="regions"> gets exactly one <text> in <g id="numbers">."""
    pal_ok, pal_rgb = _palette(_RGBS)
    img = _blocks_image(_RGBS)
    svg, nreg, used = lineart_to_svg(
        img, line_thickness=1.0, blur_amount=0, smoothness=0.4,
        palette_oklab=pal_ok, palette_rgb=pal_rgb, min_radius=4.0, work_edge=512,
    )
    assert '<g id="regions">' in svg and '<g id="numbers">' in svg
    assert svg.count("<path ") == nreg
    assert svg.count("<text ") == nreg, "every region must carry exactly one number"


def test_min_gap_is_the_only_detail_lever():
    """`min_paintable_mm` (→ min_radius) is the single detail limiter: a larger
    floor yields monotonically fewer regions (coarser), a smaller floor more."""
    pal_ok, pal_rgb = _palette(_RGBS)
    img = _blocks_image(_RGBS, block=60)
    counts = []
    for mr in (2.0, 8.0, 20.0):
        _, nreg, _ = lineart_to_svg(
            img, line_thickness=1.0, blur_amount=0, smoothness=0.4,
            palette_oklab=pal_ok, palette_rgb=pal_rgb, min_radius=mr, work_edge=512,
        )
        counts.append(nreg)
    assert counts[0] >= counts[1] >= counts[2], f"region count must fall as min_radius rises: {counts}"


def test_lineart_is_deterministic():
    pal_ok, pal_rgb = _palette(_RGBS)
    img = _blocks_image(_RGBS)
    kw = dict(line_thickness=1.0, blur_amount=1, smoothness=0.4,
              palette_oklab=pal_ok, palette_rgb=pal_rgb, min_radius=4.0, work_edge=512)
    a = lineart_to_svg(img, **kw)[0]
    b = lineart_to_svg(img, **kw)[0]
    assert a == b


def test_lineart_runs_without_palette():
    """Legacy/test fallback (prod always sends a palette): a k-means paint set is
    used, the pipeline still produces a valid numbered SVG."""
    img = _blocks_image(_RGBS)
    svg, nreg, used = lineart_to_svg(
        img, line_thickness=1.0, blur_amount=0, smoothness=0.4, min_radius=4.0, work_edge=512,
    )
    assert svg.lstrip().startswith("<?xml") and "<svg" in svg
    assert used == []  # no palette → no palette indices reported
