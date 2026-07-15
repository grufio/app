"""
Lineart filter pipeline — maximum paintable detail.

lineart shares the segmentation core with linerate (colour == region): every
pixel is snapped to its nearest chip of the FULL Munsell palette, connected
same-paint areas become regions, sub-paintable slivers merge into their most
similar-coloured neighbour, the shared-arc back half smooths the boundaries
watertight, and every surviving (paintable) region carries one number.

The ONE hard limit is paintability: `min_area` sits at the bare paintability
floor derived from `min_paintable_mm` — there is NO detail-reducing knob and NO
colour reduction (no `num_colors`, no palette selection, no median-cut, no
vtracer). Detail is therefore maximal, bounded only by how small a region can
still be painted and hold its number; the colour count emerges from the image.

The old vtracer/median-cut pipeline reduced the palette before + during the
trace (measured: it collapsed the pool to ~37-73%); it is gone.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

from .oklab import rgb255_to_oklab
from .palette_reduction import select_paints
from .linerate import _paint_map_to_svg, _l0_smooth, _flatten_to_lam

# Working resolution for lineart. MEASURED sweet spot: on a 2000x2600 source,
# 720->1280 grows the region count only ~5% (2321->2432) but the time explodes
# (6.3s->19s local, ~114s on Cloud Run = timeout risk). Detail is bounded by the
# paintability floor (`min_paintable_mm`), NOT by resolution. 960 captures ~max
# detail (2376 regions) at ~58s GCP — safely under the 90s budget. Higher buys
# almost no detail and risks the timeout, so this is the real ceiling, not a
# conservative cap.
_LINEART_WORK_EDGE = 960


def lineart_to_svg(
    img: Image.Image,
    line_thickness: float,
    blur_amount: int,
    smoothness: float,
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    min_radius: float = 8.0,
    work_edge: int = _LINEART_WORK_EDGE,
    on_phase: callable | None = None,
) -> tuple[str, int, list[int]]:
    """Full-palette paint-by-numbers at maximum paintable detail.

    Pipeline: work-resolution downscale → light L0 flatten (denoise, edge-
    preserving) → snap every pixel to the FULL palette → merge only sub-
    `min_area` slivers into the most similar-coloured neighbour → watertight
    shared-arc smoothing → one number per region.

    `blur_amount` drives the L0 flatten strength (denoise); `min_radius`
    (source px, from the "min paintable gap" dial) is the paintability floor and
    the only detail limiter; `smoothness` drives the arc smoothing. No colour
    reduction of any kind.
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    width, height = img.size
    rgb_full = img.convert("RGB")

    # --- working resolution: run the labelling at work_edge, scale vectors back ---
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

    # Light L0 flatten: edge-preserving denoise so sensor speckle doesn't shatter
    # the segmentation. blur_amount ∈ [0,20] → flatten ∈ [0,1]; low = max detail.
    flatten = min(1.0, max(0.0, (blur_amount or 0) / 20.0))
    flat = _l0_smooth(work, _flatten_to_lam(flatten))
    phase("flatten")

    X = rgb255_to_oklab(flat).reshape(-1, 3)
    have_palette = palette_oklab is not None and palette_rgb is not None
    if have_palette:
        # FULL palette — every pixel snaps to its nearest of ALL chips. sel_pal_index
        # is the identity (paint i == full-palette index i), so palette_indices_used
        # and the labels come out in full-palette space directly.
        sel_ok = np.asarray(palette_oklab, np.float64)
        sel_rgb = np.asarray(palette_rgb, np.uint8)
        sel_pal_index = np.arange(len(sel_ok), dtype=np.int32)
    else:
        # test/legacy fallback (prod always sends a palette): plain k-means paints.
        seed = int(work.astype(np.int64).sum() % (2 ** 32))
        sel_ok, sel_rgb, sel_pal_index = select_paints(
            X, work.reshape(-1, 3), 16, None, None, "top_n", seed
        )

    # min_area = the BARE paintability floor (inscribed circle of min_radius) —
    # max detail, no `detail` widening. Every region above this is kept.
    min_radius_work = min_radius * (ww / width)
    min_area = np.pi * float(min_radius_work) ** 2

    return _paint_map_to_svg(
        X, hh, ww, width, height, sx, sy, sel_ok, sel_rgb, sel_pal_index,
        have_palette, min_area, smoothness, line_thickness, min_radius, phase,
    )
