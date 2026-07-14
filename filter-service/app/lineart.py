"""
Lineart filter pipeline.

Optional Gaussian blur → palette-direct paint selection + snap → vtracer
in spline/cutout mode → add black stroke to every region → compose SVG.

Colour is now palette-first (like linerate/pixelate/circulate): ≤num_colors
REAL paints are selected from the fixed palette (top_n / pam) and every pixel
is snapped to its nearest selected paint BEFORE vtracer. So `num_colors` is a
true selection budget over the palette, and vtracer traces flat real-paint
regions (not arbitrary PIL median-cut bins). vtracer's smooth Bézier curves —
lineart's distinctive look — are unchanged.

The result is the paint-by-numbers visual most people picture when they hear
"lineart": organic colour regions with visible black outlines, each region
addressable for per-region number placement.
"""
from __future__ import annotations

import io
import re

import numpy as np
from PIL import Image, ImageFilter
import vtracer

from .oklab import nearest_palette_indices, rgb255_to_oklab
from .palette_reduction import select_paints
from .cell_labels import build_label_map
from .lineart_labels import merge_tiny_regions, render_numbers_group


# Lineart variant of the vtracer params: organic contours instead of
# 90° cell boundaries. The corner_threshold / length_threshold /
# filter_speckle defaults below are derived from `smoothness` at call
# time (see lineart_to_svg).
LINEART_VTRACER_PARAMS = dict(
    colormode="color",
    mode="spline",
    hierarchical="cutout",
    color_precision=8,
    layer_difference=0,
    path_precision=2,
    splice_threshold=45,
)


def palette_snap_image(
    img: Image.Image,
    num_colors: int,
    palette_oklab: list | None,
    palette_rgb: list | None,
    palette_restriction: str,
) -> tuple[Image.Image, np.ndarray | None, np.ndarray | None, np.ndarray | None]:
    """Palette-direct pre-quantise for vtracer.

    Selects ≤`num_colors` REAL paints from the fixed palette via the shared
    coverage reduction (`select_paints`: top_n / pam) and snaps every pixel to
    its nearest SELECTED paint, so vtracer traces flat real-paint regions and
    `num_colors` is a true selection budget over the palette (not a PIL
    median-cut colour count with an 8-bit ceiling).

    Returns `(prepared_img, sel_ok, sel_rgb, sel_pal_index)`:
      - `prepared_img` : RGB image, every pixel an exact selected-paint colour.
      - `sel_ok/sel_rgb`: the K selected paints (OKLab / RGB) — reused to re-snap
                          vtracer's fills.
      - `sel_pal_index`: `sel_pal_index[i]` = index in the FULL palette of the
                          i-th selected paint — reused to map region indices back
                          to full-palette space for labels + `palette_indices_used`.

    Without a palette (tests / legacy) it is a no-op: `(img_as_rgb, None, None,
    None)` — the caller's `sel_ok is None` guard then skips snap / merge / numbers,
    and vtracer sees the raw (blurred) image, preserving the no-palette contract.
    """
    rgb = np.asarray(img.convert("RGB"), dtype=np.uint8)
    if palette_oklab is None or palette_rgb is None:
        return Image.fromarray(rgb, "RGB"), None, None, None

    h, w, _ = rgb.shape
    pal_ok = np.asarray(palette_oklab, dtype=np.float64)
    pal_rgb = np.asarray(palette_rgb, dtype=np.uint8)
    okf = rgb255_to_oklab(rgb).reshape(-1, 3)
    rgb_flat = rgb.reshape(-1, 3)
    seed = int(rgb.astype(np.int64).sum() % (2 ** 32))   # deterministic per image
    sel_ok, sel_rgb, sel_pal_index = select_paints(
        okf, rgb_flat, num_colors, pal_ok, pal_rgb, palette_restriction, seed
    )
    idx = nearest_palette_indices(okf, sel_ok).reshape(h, w)
    snapped = np.asarray(sel_rgb, dtype=np.uint8)[idx]   # (h, w, 3), each pixel a real paint
    return Image.fromarray(snapped, "RGB"), sel_ok, sel_rgb, sel_pal_index


# vtracer emits an outer `<svg>` envelope; we re-wrap the path body
# inside our own document so we can layer it under the grid lines
# and add the white background + viewBox the editor expects.
_PATHS_RE = re.compile(r"<path\b[^/]*/>", re.IGNORECASE)


def extract_path_elements(svg_str: str) -> list[str]:
    """Pull every `<path .../>` self-closing element out of the
    vtracer envelope. Returns them as raw markup strings."""
    return _PATHS_RE.findall(svg_str)


# Lineart strokes are injected after vtracer emits the path elements.
# vtracer's `<path d="..." fill="#RRGGBB" transform="..."/>` form has no
# stroke attribute; we splice one in.
_FILL_ATTR_RE = re.compile(r'\bfill="(#[0-9A-Fa-f]{6})"')


def add_stroke_to_path(path_str: str, color: str, width: float) -> str:
    """Insert `stroke` + `stroke-width` attributes into a vtracer
    `<path .../>` element. Idempotent: if the path already has a
    stroke, leave it alone."""
    if 'stroke="' in path_str:
        return path_str
    # Splice the attributes right before the closing `/>` so they
    # come after `fill` / `transform`.
    return path_str.replace("/>", f' stroke="{color}" stroke-width="{width}"/>')


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def snap_path_fills_to_palette(
    paths: list[str],
    sel_ok: np.ndarray,
    sel_rgb: np.ndarray,
    sel_pal_index: np.ndarray,
) -> tuple[list[str], np.ndarray]:
    """Re-snap every `<path>`'s vtracer-emitted fill to the nearest SELECTED
    paint and rewrite it to that paint's exact RGB. The pixels were already
    snapped to the selected paints, but vtracer can average a region's fill a
    hair off the exact chip on curved / anti-aliased edges — this guarantees
    every emitted fill is a real selected paint (and can never land on a chip
    outside the `num_colors` budget).

    Returns `(rewritten_paths, indices)` where `indices` are in the FULL palette
    space: the fill is snapped in the K-entry selected space, then mapped back via
    `sel_pal_index`. So `merge_tiny_regions` / `build_label_map` /
    `palette_indices_used` downstream stay in full-palette space, unchanged.

    Paths without a parseable fill keep their original markup and map to full
    index 0 — usually vtracer's transparent / background regions, which don't
    reach the snap in practice.
    """
    fills_rgb: list[tuple[int, int, int]] = []
    fill_matches: list[re.Match[str] | None] = []
    for path in paths:
        m = _FILL_ATTR_RE.search(path)
        fill_matches.append(m)
        fills_rgb.append(_hex_to_rgb(m.group(1)) if m else (0, 0, 0))

    oklab = rgb255_to_oklab(np.asarray(fills_rgb, dtype=np.uint8))
    sel_idx = nearest_palette_indices(oklab, sel_ok)                     # selected space
    full_idx = np.asarray(sel_pal_index, dtype=np.int64)[sel_idx]        # → full palette
    sel_rgb_arr = np.asarray(sel_rgb, dtype=np.uint8)

    snapped_paths: list[str] = []
    for path, match, si in zip(paths, fill_matches, sel_idx):
        if match is None:
            snapped_paths.append(path)
            continue
        r, g, b = sel_rgb_arr[int(si)]
        new_fill = f'fill="#{int(r):02x}{int(g):02x}{int(b):02x}"'
        snapped_paths.append(path[: match.start()] + new_fill + path[match.end() :])
    return snapped_paths, full_idx


def lineart_to_svg(
    img: Image.Image,
    line_thickness: float,
    blur_amount: int,
    smoothness: float,
    num_colors: int = 8,
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    palette_restriction: str = "top_n",
    min_radius: float = 8.0,
    on_phase: callable | None = None,
) -> tuple[str, int, list[int]]:
    """
    Lineart pipeline: optional Gaussian blur → palette-direct paint selection +
    snap → vtracer in spline / cutout mode → add black stroke to every region →
    compose SVG.

    The result is the paint-by-numbers visual most people picture when they hear
    "lineart": organic colour regions with visible black outlines, each region
    addressable for per-region number placement.

    `smoothness` is mapped to vtracer's `corner_threshold` (0=sharp, 1=smooth). A
    `length_threshold` derived from the same dial controls path simplification —
    short noisy segments collapse at higher smoothness.
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    width, height = img.size

    # Denoise BEFORE selection so sensor speckle doesn't fragment the paint
    # selection or scatter neighbouring pixels onto different chips.
    prepared_src = img
    if blur_amount and blur_amount > 0:
        prepared_src = img.filter(ImageFilter.GaussianBlur(radius=blur_amount))
    phase("blur")

    # Palette-direct: select ≤num_colors real paints and snap every pixel to the
    # nearest selected paint (the snap IS the discretisation — no separate PIL
    # median-cut, no re-quantise). vtracer then traces flat real-paint regions.
    prepared, sel_ok, sel_rgb, sel_pal_index = palette_snap_image(
        prepared_src, num_colors, palette_oklab, palette_rgb, palette_restriction
    )
    phase("quantise")

    # Map smoothness ∈ [0, 1] to:
    #   corner_threshold ∈ [180, 60]   (0=preserve sharp corners, 1=allow strong curves)
    #   length_threshold ∈ [0, 8]      (0=no simplification, 1=aggressive)
    #   filter_speckle   ∈ [16, 32]    (mild de-speckle only; a bigger value
    #     tied to min_radius was tried but vtracer's speckle filter collapses
    #     real regions past a point — the paint-by-numbers sizing is enforced
    #     precisely by `merge_tiny_regions`, not here).
    s = max(0.0, min(1.0, smoothness))
    corner_threshold = int(round(180 - s * 120))
    length_threshold = round(s * 8.0, 2)
    filter_speckle = max(16, int(round(s * 32)))
    # Encoded bytes, not list(getdata()) — the per-pixel tuple list is
    # a multi-hundred-MB to GB allocation on large images. vtracer
    # decodes the PNG in Rust; output matches.
    buf = io.BytesIO()
    prepared.save(buf, format="PNG")
    del prepared
    traced = vtracer.convert_raw_image_to_svg(
        buf.getvalue(),
        "png",
        corner_threshold=corner_threshold,
        length_threshold=length_threshold,
        filter_speckle=filter_speckle,
        **LINEART_VTRACER_PARAMS,
    )
    phase("vtracer")

    raw_paths = extract_path_elements(traced)

    # When a palette was supplied, re-snap every vtracer fill to the nearest
    # SELECTED paint (guards against vtracer's edge-averaging drifting a fill off
    # the exact chip) and translate to full-palette indices. The geometry stays
    # put; only the fills lock to real paints. The indices used flow back to the
    # editor so the Colors sheet renders them.
    palette_indices_used: list[int] = []
    numbers_group = ""
    if sel_ok is not None and raw_paths:
        snapped_paths, indices = snap_path_fills_to_palette(
            raw_paths, sel_ok, sel_rgb, sel_pal_index
        )
        # Paint-by-numbers merge: any region whose largest inscribed
        # circle is below R_min gets unioned into its largest
        # neighbour. Recompute `palette_indices_used` from the
        # post-merge indices so the Colors sheet only lists chips
        # that actually survive in the output.
        snapped_paths, indices = merge_tiny_regions(snapped_paths, indices, min_radius=min_radius)
        raw_paths = snapped_paths
        palette_indices_used = sorted(int(i) for i in np.unique(indices).tolist())
        label_map = build_label_map(indices)
        numbers_group = render_numbers_group(
            raw_paths, indices, label_map, min_radius=min_radius, max_font=24.0
        )
        phase("palette")

    color_paths = [add_stroke_to_path(p, "black", line_thickness) for p in raw_paths]
    region_count = len(color_paths)
    phase("extract")

    # No opaque background rect — the trace renders as a layer on top
    # of the filter chain tip in the editor; a future toggle hides the
    # whole trace layer to reveal the raster underneath. An opaque
    # white sheet here would block both. The numbers group sits ABOVE
    # `<g id="regions">` so labels paint on top of the fills + strokes;
    # `data-numbers-visible` CSS gates it from the frontend.
    svg_content = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">\n'
        f'  <g id="regions">\n'
        f'    {chr(10).join(color_paths)}\n'
        f'  </g>\n'
        f'  {numbers_group}\n'
        f'</svg>'
    )
    phase("serialize")

    return svg_content, region_count, palette_indices_used
