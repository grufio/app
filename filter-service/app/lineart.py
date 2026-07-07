"""
Lineart filter pipeline.

Palette-quantise → optional Gaussian blur → vtracer in spline/cutout
mode → add black stroke to every region → compose SVG.

The result is the paint-by-numbers visual most people picture when
they hear "lineart": organic colour regions with visible black
outlines, each region addressable for future per-region label
placement.
"""
from __future__ import annotations

import io
import re

import numpy as np
from PIL import Image, ImageFilter
import vtracer

from .oklab import nearest_palette_indices, rgb255_to_oklab
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


def quantise_image(img: Image.Image, num_colors: int) -> Image.Image:
    """
    Reduce the image's palette to `num_colors` distinct colors via
    PIL's median-cut quantizer. Returns an RGB image with the
    reduced palette baked in (so vtracer sees discrete colors,
    not a continuous gradient).

    Upstream Zod (`lib/editor/trace/lineart.ts`) clamps `num_colors`
    to [2, 256]; the `< 2` branch is unreachable in prod (kept as
    defence-in-depth). `>= 256` is the no-op perf shortcut: at the
    upper bound every PIL bucket maps to one source colour, so
    quantising is wasted work.
    """
    if num_colors >= 256 or num_colors < 2:
        return img if img.mode == "RGB" else img.convert("RGB")
    quantised = img.quantize(colors=num_colors, method=Image.MEDIANCUT)
    return quantised.convert("RGB")


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
    palette_oklab: np.ndarray,
    palette_rgb: np.ndarray,
) -> tuple[list[str], np.ndarray]:
    """Snap every `<path>`'s vtracer-emitted fill to the nearest
    palette chip. Same OKLab-nearest match as pixelate / circulate
    (single-step: free RGB → palette chip, no double-loss
    median-cut intermediate). Returns the rewritten path strings +
    the per-path index array.

    Paths without a parseable fill keep their original markup and
    map to index 0 in the returned array — those are usually
    vtracer's transparent / background regions and don't reach the
    snap step in practice.
    """
    fills_rgb: list[tuple[int, int, int]] = []
    fill_matches: list[re.Match[str] | None] = []
    for path in paths:
        m = _FILL_ATTR_RE.search(path)
        fill_matches.append(m)
        fills_rgb.append(_hex_to_rgb(m.group(1)) if m else (0, 0, 0))

    rgb_arr = np.asarray(fills_rgb, dtype=np.uint8)
    oklab = rgb255_to_oklab(rgb_arr)
    indices = nearest_palette_indices(oklab, palette_oklab)
    palette_rgb_arr = np.asarray(palette_rgb, dtype=np.uint8)

    snapped_paths: list[str] = []
    for path, match, idx in zip(paths, fill_matches, indices):
        if match is None:
            snapped_paths.append(path)
            continue
        r, g, b = palette_rgb_arr[int(idx)]
        new_fill = f'fill="#{int(r):02x}{int(g):02x}{int(b):02x}"'
        snapped_paths.append(path[: match.start()] + new_fill + path[match.end() :])
    return snapped_paths, indices


def lineart_to_svg(
    img: Image.Image,
    line_thickness: float,
    blur_amount: int,
    smoothness: float,
    num_colors: int = 8,
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    min_radius: float = 8.0,
    on_phase: callable | None = None,
) -> tuple[str, int, list[int]]:
    """
    Lineart pipeline: quantise palette → optional Gaussian blur →
    vtracer in spline / cutout mode → add black stroke to every
    region → compose SVG.

    The result is the paint-by-numbers visual most people picture
    when they hear "lineart": organic color regions with visible
    black outlines, each region addressable for future per-region
    label placement.

    `smoothness` is mapped to vtracer's `corner_threshold` (0=sharp,
    1=smooth). A `length_threshold` derived from the same dial
    controls path simplification — short noisy segments collapse at
    higher smoothness.
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    width, height = img.size

    quantised = quantise_image(img, num_colors)
    phase("quantise")

    if blur_amount and blur_amount > 0:
        blurred = quantised.filter(ImageFilter.GaussianBlur(radius=blur_amount))
        # Re-quantise after blur so the strokes lock to crisp palette
        # boundaries, not smeared intermediate colors.
        prepared = quantise_image(blurred, num_colors)
    else:
        prepared = quantised
    phase("blur")

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

    # When a palette is supplied, snap every vtracer fill to the
    # nearest Munsell chip — same single-step rgb→palette pattern as
    # pixelate / circulate. The geometry stays put (vtracer's
    # region boundaries were derived from the median-cut quantised
    # source); only the fills change. The set of indices used flows
    # back to the editor so the Colors sheet renders them.
    palette_indices_used: list[int] = []
    numbers_group = ""
    if palette_oklab is not None and palette_rgb is not None and raw_paths:
        snapped_paths, indices = snap_path_fills_to_palette(
            raw_paths,
            np.asarray(palette_oklab, dtype=np.float32),
            np.asarray(palette_rgb, dtype=np.uint8),
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
