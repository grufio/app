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

import io
import re

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


# vtracer emits an outer `<svg>` envelope; we re-wrap the path body
# inside our own document so we can layer it under the grid lines
# and add the white background + viewBox the editor expects.
_PATHS_RE = re.compile(r"<path\b[^/]*/>", re.IGNORECASE)


def extract_path_elements(svg_str: str) -> list[str]:
    """Pull every `<path .../>` self-closing element out of the
    vtracer envelope. Returns them as raw markup strings."""
    return _PATHS_RE.findall(svg_str)


def grid_lines_svg(
    crop_x: float,
    crop_y: float,
    crop_w: float,
    crop_h: float,
    cells_x: int,
    cells_y: int,
    stroke_width: float,
) -> list[str]:
    """Vertical + horizontal lines overlaying the cell boundaries.

    Lines span only the crop region `(crop_x, crop_y, crop_w, crop_h)`
    — the part the grid actually covers — at exact float positions, so
    the cell borders line up with the colour paths and the border area
    stays empty.
    """
    out: list[str] = []
    for i in range(cells_x + 1):
        x = crop_x + i * crop_w / cells_x
        out.append(
            f'<line x1="{x:.4f}" y1="{crop_y:.4f}" x2="{x:.4f}" y2="{crop_y + crop_h:.4f}" '
            f'stroke="black" stroke-width="{stroke_width}" />'
        )
    for i in range(cells_y + 1):
        y = crop_y + i * crop_h / cells_y
        out.append(
            f'<line x1="{crop_x:.4f}" y1="{y:.4f}" x2="{crop_x + crop_w:.4f}" y2="{y:.4f}" '
            f'stroke="black" stroke-width="{stroke_width}" />'
        )
    return out


def numerate_to_svg(
    img: Image.Image,
    cells_x: int,
    cells_y: int,
    crop_x: float,
    crop_y: float,
    crop_w: float,
    crop_h: float,
    stroke_width: float,
    show_colors: bool,
    num_colors: int = 16,
    on_phase: callable | None = None,
) -> tuple[str, int]:
    """
    Build the numerate SVG from the server-resolved grid.

    The cell grid + crop rect come pre-resolved (`resolveNumerateGrid`
    on the server is the single source of truth). The pipeline here
    is: crop the source to the grid region → downsample straight to a
    `cells_x × cells_y` image (1 cell = 1 px, area-averaged) →
    quantise that tiny grid → vtracer → region paths. Everything runs
    on the tiny grid, never the full-res image.

    The colour paths are placed inside the full-image viewBox at the
    crop offset, scaled to the crop size. Whatever lies outside the
    crop is the centred border — left empty.

    `on_phase(name)` is the optional phase-timer hook. Returns
    (svg_string, region_count).
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    img_w, img_h = img.size

    # Crop to the grid region. Round to integer pixel bounds for the
    # PIL crop; the SVG transform below uses the exact float crop rect
    # so cell placement stays precise (sub-pixel rounding is invisible).
    cx0 = max(0, round(crop_x))
    cy0 = max(0, round(crop_y))
    cx1 = min(img_w, round(crop_x + crop_w))
    cy1 = min(img_h, round(crop_y + crop_h))
    cropped = img.convert("RGB").crop((cx0, cy0, cx1, cy1))
    phase("crop")

    color_paths: list[str] = []
    region_count = 0

    if show_colors:
        # Downsample straight to the cell grid: 1 cell = 1 px, each
        # cell the area-average of its source block (Image.BOX).
        cell_grid = cropped.resize((cells_x, cells_y), Image.BOX)
        phase("downsample")

        cell_grid = quantise_image(cell_grid, num_colors)
        phase("quantise")

        # vtracer decodes the encoded image in Rust — feed it the tiny
        # cell-grid PNG, not a per-pixel tuple list. Paths come back in
        # [0, cells_x] × [0, cells_y] coordinate space.
        buf = io.BytesIO()
        cell_grid.save(buf, format="PNG")
        traced = vtracer.convert_raw_image_to_svg(
            buf.getvalue(), "png", **VTRACER_PARAMS
        )
        phase("vtracer")

        color_paths = extract_path_elements(traced)
        region_count = len(color_paths)
        phase("extract")
    else:
        phase("downsample")
        phase("quantise")
        phase("vtracer")
        phase("extract")

    grid = grid_lines_svg(crop_x, crop_y, crop_w, crop_h, cells_x, cells_y, stroke_width)
    phase("lines")

    # Place the cell-coordinate paths at the crop offset, scaled to the
    # crop size, within the full-image viewBox. No opaque background —
    # the trace renders as a layer on top of the filter chain tip; the
    # border area is simply left empty.
    scale_x = crop_w / cells_x
    scale_y = crop_h / cells_y
    svg_content = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{img_w}" height="{img_h}" '
        f'viewBox="0 0 {img_w} {img_h}">\n'
        f'  <g id="colors" transform="translate({crop_x:.4f} {crop_y:.4f}) '
        f'scale({scale_x:.6f} {scale_y:.6f})">\n'
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


def add_stroke_to_path(path_str: str, color: str, width: float) -> str:
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
    line_thickness: float,
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

    # Map smoothness ∈ [0, 1] to:
    #   corner_threshold ∈ [180, 60]   (0=preserve sharp corners, 1=allow strong curves)
    #   length_threshold ∈ [0, 8]      (0=no simplification, 1=aggressive)
    #   filter_speckle   ∈ [0, 32]     (0=keep all blobs, 1=drop everything < 32 px)
    s = max(0.0, min(1.0, smoothness))
    corner_threshold = int(round(180 - s * 120))
    length_threshold = round(s * 8.0, 2)
    filter_speckle = int(round(s * 32))
    # Encoded bytes, not list(getdata()) — see numerate_to_svg: the
    # per-pixel tuple list is a multi-hundred-MB to GB allocation on
    # large images. vtracer decodes the PNG in Rust; output matches.
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
    color_paths = [add_stroke_to_path(p, "black", line_thickness) for p in raw_paths]
    region_count = len(color_paths)
    phase("extract")

    # No opaque background rect — see comment in `numerate_to_svg`
    # for the rationale (overlay rendering + future visibility toggle).
    svg_content = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}">\n'
        f'  <g id="regions">\n'
        f'    {chr(10).join(color_paths)}\n'
        f'  </g>\n'
        f'</svg>'
    )
    phase("serialize")

    return svg_content, region_count

