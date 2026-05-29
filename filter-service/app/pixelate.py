"""
Pixelate filter pipeline — direct SVG renderer.

Two entry points:

- `pixelate_cells_to_svg` (current): the caller (Vercel server) has already
  cropped + area-averaged the source to a `cells_y × cells_x × 3` uint8 grid.
  This function just snaps each cell to the nearest palette chip and emits
  one `<rect>` per cell + grid lines. The whole job is small-array numpy
  + string concatenation — milliseconds.

- `pixelate_to_svg` (legacy): full pipeline, kept for the deploy lap while
  old Vercel revisions are still in rotation. Crops with PIL, downsamples
  via `Image.BOX` (geometrically equivalent to the TS `cellAreaAverages`
  mirror in `lib/editor/trace/trace-cell-colors.ts`), then delegates to
  `pixelate_cells_to_svg`. Also re-encodes the cropped bitmap as PNG and
  hands it back — the legacy Vercel code stores that as the `trace_base`
  row. Delete this once the cells path has soaked.

No quantise, no vtracer — every cell boundary stays pixel-perfect
axis-aligned by construction.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

from .cell_colors import compute_cell_colors, map_cells_to_palette


def _grid_lines(
    crop_w: float,
    crop_h: float,
    cells_x: int,
    cells_y: int,
    stroke_width: float,
) -> list[str]:
    """Vertical + horizontal lines overlaying the cell boundaries.

    Coordinates live in the crop-sized viewBox (0..crop_w × 0..crop_h)
    so they overlay the colour rects exactly. The border area outside
    the crop no longer exists in this SVG — the bitmap returned to
    the caller is the same crop.
    """
    out: list[str] = []
    for i in range(cells_x + 1):
        x = i * crop_w / cells_x
        out.append(
            f'<line x1="{x:.4f}" y1="0" x2="{x:.4f}" y2="{crop_h:.4f}" '
            f'stroke="black" stroke-width="{stroke_width}" />'
        )
    for i in range(cells_y + 1):
        y = i * crop_h / cells_y
        out.append(
            f'<line x1="0" y1="{y:.4f}" x2="{crop_w:.4f}" y2="{y:.4f}" '
            f'stroke="black" stroke-width="{stroke_width}" />'
        )
    return out


def pixelate_cells_to_svg(
    cell_means: np.ndarray,
    cropped_w_px: int,
    cropped_h_px: int,
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    on_phase: callable | None = None,
) -> tuple[str, int]:
    """
    Render the pixelate SVG from a pre-computed per-cell colour grid.

    `cell_means` is a `(cells_y, cells_x, 3)` uint8 RGB array — the
    area-averaged per-cell colours, computed by the caller (Vercel server's
    `cellAreaAverages` on a `sharp(...).raw()` crop). `cropped_w_px` and
    `cropped_h_px` are the cropped-source pixel dimensions used for the
    SVG viewBox and the cell-to-pixel scale.

    `palette_oklab` + `palette_rgb`: same contract as the legacy entry
    point — when both are given, each cell is snapped to its nearest chip;
    when omitted, raw area-average means are emitted.

    Returns `(svg_string, region_count)`. The cropped PNG is the caller's
    responsibility (the Vercel server already has it from sharp).
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    cells_y, cells_x, _ = cell_means.shape
    arr = cell_means

    if palette_oklab is not None and palette_rgb is not None:
        arr = map_cells_to_palette(arr, palette_oklab, palette_rgb)
        phase("palette")

    color_rects: list[str] = []
    for y in range(cells_y):
        for x in range(cells_x):
            r, g, b = arr[y, x]
            color_rects.append(
                f'<rect x="{x}" y="{y}" width="1" height="1" '
                f'fill="#{r:02x}{g:02x}{b:02x}"/>'
            )
    phase("render")

    region_count = len(color_rects)

    # Grid stroke is hardcoded to 1px (matches the legacy default; the
    # editor never sent anything else).
    grid = _grid_lines(cropped_w_px, cropped_h_px, cells_x, cells_y, 1.0)
    phase("lines")

    # Cell coordinates → scaled to the cropped bitmap's size. No
    # translate: the SVG's viewBox is the crop, the bitmap stored by
    # the caller is the crop, the editor stacks them 1:1.
    scale_x = cropped_w_px / cells_x
    scale_y = cropped_h_px / cells_y
    svg_content = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{cropped_w_px}" height="{cropped_h_px}" '
        f'viewBox="0 0 {cropped_w_px} {cropped_h_px}">\n'
        f'  <g id="colors" transform="scale({scale_x:.6f} {scale_y:.6f})">\n'
        f'    {chr(10).join(color_rects)}\n'
        f'  </g>\n'
        f'  <g id="grid">\n'
        f'    {chr(10).join(grid)}\n'
        f'  </g>\n'
        f'</svg>'
    )
    phase("serialize")

    return svg_content, region_count


def pixelate_to_svg(
    img: Image.Image,
    cells_x: int,
    cells_y: int,
    crop_x: float,
    crop_y: float,
    crop_w: float,
    crop_h: float,
    stroke_width: float,
    num_colors: int = 16,  # accepted for wizard backward-compat; ignored
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    on_phase: callable | None = None,
) -> tuple[str, bytes, int]:
    """
    Legacy entry point: full source → cropped → downsampled → SVG + PNG.

    Kept on the back-compat code path while old Vercel revisions are still
    sending `image_base64` + `crop_*`. Delete with the corresponding
    `_pixelate_filter_legacy` branch once the cells path has soaked.
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    img_w, img_h = img.size

    cx0 = max(0, round(crop_x))
    cy0 = max(0, round(crop_y))
    cx1 = min(img_w, round(crop_x + crop_w))
    cy1 = min(img_h, round(crop_y + crop_h))
    cropped = img.convert("RGB").crop((cx0, cy0, cx1, cy1))
    phase("crop")

    cropped_w_px, cropped_h_px = cropped.size

    cell_means = compute_cell_colors(cropped, cells_x, cells_y)
    phase("downsample")

    svg_content, region_count = pixelate_cells_to_svg(
        cell_means=cell_means,
        cropped_w_px=cropped_w_px,
        cropped_h_px=cropped_h_px,
        palette_oklab=palette_oklab,
        palette_rgb=palette_rgb,
        on_phase=on_phase,
    )

    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    cropped_png = buf.getvalue()
    phase("encode_cropped")

    return svg_content, cropped_png, region_count
