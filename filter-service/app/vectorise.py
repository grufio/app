"""
F20: vtracer-driven numerate pipeline.

Replaces the bespoke 192×108 nested-loop that emitted ~20K
`<rect>` strings per call (47ms of pure string assembly, 1.5MB
SVG payload) with a vectorisation engine that:
  1. Quantises the image to a limited palette (paint-by-numbers
     requires few colors anyway).
  2. Builds the superpixel-grid image where each cell is solid
     palette color.
  3. Runs vtracer in polygon / cutout mode so adjacent same-color
     cells collapse into one path per connected component while
     90° cell corners are preserved.
  4. Overlays the original grid lines on top.

The result: the same paint-by-numbers semantics (one colored
region per connected component, addressable for future label
annotation), at a fraction of the size and string-assembly cost.

Numbers (centroid-based label placement) are NOT emitted yet —
that's a follow-up once the product UX for label rendering lands.
The polygon-per-region structure is preserved so adding `<text>`
elements at centroids becomes a one-liner per path.
"""
from __future__ import annotations

import re

import numpy as np
from PIL import Image, ImageFilter
import vtracer


VTRACER_PARAMS = dict(
    colormode="color",
    mode="polygon",
    hierarchical="cutout",   # one path-element per connected region
    filter_speckle=0,         # don't merge across superpixel cells
    corner_threshold=180,     # preserve 90° corners
    length_threshold=0,       # no path simplification
    splice_threshold=180,     # no curve splicing
    color_precision=8,
    layer_difference=0,
    path_precision=2,
)

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
    """
    if num_colors >= 256 or num_colors < 2:
        return img if img.mode == "RGB" else img.convert("RGB")
    # MEDIANCUT is the same algorithm pixelate uses — keep behaviour
    # consistent across the two surfaces.
    quantised = img.quantize(colors=num_colors, method=Image.MEDIANCUT)
    return quantised.convert("RGB")


def build_superpixel_image(
    img: Image.Image,
    superpixel_width: int,
    superpixel_height: int,
) -> tuple[Image.Image, int, int]:
    """
    Collapse the input image into its superpixel-grid form: each
    `superpixel_width × superpixel_height` block is replaced by its
    mean color. Returns (pixelated_image, grid_width, grid_height).
    """
    width, height = img.size
    grid_width = width // superpixel_width
    grid_height = height // superpixel_height

    sw = superpixel_width
    sh = superpixel_height
    h_crop = grid_height * sh
    w_crop = grid_width * sw

    arr = np.array(img.convert("RGB"))
    block_means = (
        arr[:h_crop, :w_crop]
        .reshape(grid_height, sh, grid_width, sw, 3)
        .mean(axis=(1, 3))
        .astype(np.uint8)
    )
    expanded = block_means.repeat(sh, axis=0).repeat(sw, axis=1)
    # Keep the original canvas size — pad the bottom/right edge
    # cells with white so vtracer sees the full image rectangle.
    out = np.full((height, width, 3), 255, dtype=np.uint8)
    out[:h_crop, :w_crop] = expanded
    return Image.fromarray(out, mode="RGB"), grid_width, grid_height


# vtracer emits an outer `<svg>` envelope; we re-wrap the path body
# inside our own document so we can layer it under the grid lines
# and add the white background + viewBox the editor expects.
_PATHS_RE = re.compile(r"<path\b[^/]*/>", re.IGNORECASE)


def extract_path_elements(svg_str: str) -> list[str]:
    """Pull every `<path .../>` self-closing element out of the
    vtracer envelope. Returns them as raw markup strings."""
    return _PATHS_RE.findall(svg_str)


def grid_lines_svg(
    width: int,
    height: int,
    superpixel_width: int,
    superpixel_height: int,
    grid_width: int,
    grid_height: int,
    stroke_width: int,
) -> list[str]:
    """Vertical + horizontal lines that overlay the cell boundaries."""
    out: list[str] = []
    for i in range(grid_width + 1):
        x = min(i * superpixel_width, width)
        out.append(
            f'<line x1="{x}" y1="0" x2="{x}" y2="{height}" '
            f'stroke="black" stroke-width="{stroke_width}" />'
        )
    for i in range(grid_height + 1):
        y = min(i * superpixel_height, height)
        out.append(
            f'<line x1="0" y1="{y}" x2="{width}" y2="{y}" '
            f'stroke="black" stroke-width="{stroke_width}" />'
        )
    return out


def numerate_to_svg(
    img: Image.Image,
    superpixel_width: int,
    superpixel_height: int,
    stroke_width: int,
    show_colors: bool,
    num_colors: int = 16,
    on_phase: callable | None = None,
) -> tuple[str, int]:
    """
    Build the numerate SVG. `on_phase(name)` is the optional phase
    timer hook used by the Python endpoint to surface
    `X-Profile-Phases`. Returns (svg_string, region_count).
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    width, height = img.size

    color_paths: list[str] = []
    region_count = 0

    if show_colors:
        quantised = quantise_image(img, num_colors)
        phase("quantise")

        pixelated, _grid_w, _grid_h = build_superpixel_image(
            quantised, superpixel_width, superpixel_height
        )
        phase("superpixel")

        rgba = pixelated.convert("RGBA")
        pixels = list(rgba.getdata())
        traced = vtracer.convert_pixels_to_svg(
            pixels, size=(width, height), **VTRACER_PARAMS
        )
        phase("vtracer")

        color_paths = extract_path_elements(traced)
        region_count = len(color_paths)
        phase("extract")
    else:
        phase("quantise")
        phase("superpixel")
        phase("vtracer")
        phase("extract")

    grid_width = width // superpixel_width
    grid_height = height // superpixel_height
    grid = grid_lines_svg(
        width, height, superpixel_width, superpixel_height,
        grid_width, grid_height, stroke_width,
    )
    phase("lines")

    svg_content = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">\n'
        f'  <rect width="{width}" height="{height}" fill="white"/>\n'
        f'  <g id="colors">\n'
        f'    {chr(10).join(color_paths)}\n'
        f'  </g>\n'
        f'  <g id="grid">\n'
        f'    {chr(10).join(grid)}\n'
        f'  </g>\n'
        f'</svg>'
    )
    phase("serialize")

    return svg_content, region_count


# Lineart strokes are injected after vtracer emits the path elements.
# vtracer's `<path d="..." fill="#RRGGBB" transform="..."/>` form has no
# stroke attribute; we splice one in.
_FILL_ATTR_RE = re.compile(r'\bfill="(#[0-9A-Fa-f]{6})"')


def add_stroke_to_path(path_str: str, color: str, width: int) -> str:
    """Insert `stroke` + `stroke-width` attributes into a vtracer
    `<path .../>` element. Idempotent: if the path already has a
    stroke, leave it alone."""
    if 'stroke="' in path_str:
        return path_str
    # Splice the attributes right before the closing `/>` so they
    # come after `fill` / `transform`.
    return path_str.replace("/>", f' stroke="{color}" stroke-width="{width}"/>')


def lineart_to_svg(
    img: Image.Image,
    line_thickness: int,
    blur_amount: int,
    smoothness: float,
    num_colors: int = 8,
    on_phase: callable | None = None,
) -> tuple[str, int]:
    """
    Lineart pipeline (F20 PR2): quantise palette → optional Gaussian
    blur → vtracer in spline / cutout mode → add black stroke to
    every region → compose SVG.

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

    rgba = prepared.convert("RGBA")
    pixels = list(rgba.getdata())
    # Map smoothness ∈ [0, 1] to:
    #   corner_threshold ∈ [180, 60]   (0=preserve sharp corners, 1=allow strong curves)
    #   length_threshold ∈ [0, 8]      (0=no simplification, 1=aggressive)
    #   filter_speckle   ∈ [0, 32]     (0=keep all blobs, 1=drop everything < 32 px)
    s = max(0.0, min(1.0, smoothness))
    corner_threshold = int(round(180 - s * 120))
    length_threshold = round(s * 8.0, 2)
    filter_speckle = int(round(s * 32))
    traced = vtracer.convert_pixels_to_svg(
        pixels,
        size=(width, height),
        corner_threshold=corner_threshold,
        length_threshold=length_threshold,
        filter_speckle=filter_speckle,
        **LINEART_VTRACER_PARAMS,
    )
    phase("vtracer")

    raw_paths = extract_path_elements(traced)
    color_paths = [add_stroke_to_path(p, "black", line_thickness) for p in raw_paths]
    region_count = len(color_paths)
    phase("extract")

    svg_content = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">\n'
        f'  <rect width="{width}" height="{height}" fill="white"/>\n'
        f'  <g id="regions">\n'
        f'    {chr(10).join(color_paths)}\n'
        f'  </g>\n'
        f'</svg>'
    )
    phase("serialize")

    return svg_content, region_count

