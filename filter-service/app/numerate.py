"""
Numerate filter pipeline — direct SVG renderer.

Produces a paint-by-numbers cell-grid SVG from a source image:

  1. Crop the source to the resolved grid region.
  2. Downsample straight to a cells_x × cells_y bitmap (one
     pixel per supercell, area-averaged via Image.BOX).
  3. Emit one <rect width=1 height=1 fill=#rrggbb/> per cell
     at its mean colour, in cell-coordinate space.
  4. Overlay the grid lines on top.
  5. Wrap everything in a <g transform> that scales the cell
     coordinates back to the crop-sized viewBox.

The cropped bitmap is returned alongside the SVG so the editor can
swap it in as the canvas background — the SVG's viewBox matches
the crop exactly, so overlay and bitmap line up by construction
without any border strip leaking through.

No quantise, no vtracer — every cell boundary stays pixel-perfect
axis-aligned by construction. The future palette map (gruf.io's
fixed 140 colours + 48 greys) will hook in between steps 2 and 3,
so cell mean colours map straight to the closest palette entry
without an intermediate median-cut step (which would double-loss
information).
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image


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


def numerate_to_svg(
    img: Image.Image,
    cells_x: int,
    cells_y: int,
    crop_x: float,
    crop_y: float,
    crop_w: float,
    crop_h: float,
    stroke_width: float,
    num_colors: int = 16,  # accepted for wizard backward-compat; ignored
    on_phase: callable | None = None,
) -> tuple[str, bytes, int]:
    """
    Build the numerate SVG + cropped bitmap from the server-resolved grid.

    The cell grid + crop rect come pre-resolved by `resolveNumerateGrid`
    on the server. This function crops, downsamples to a
    `cells_x × cells_y` bitmap (1 cell = 1 px, area-averaged), then
    emits one `<rect>` per cell at its mean colour. Grid lines
    overlay the cell boundaries. The SVG's viewBox matches the crop
    size exactly; cell coordinates are scaled (no translate) so the
    overlay aligns 1:1 with the returned cropped bitmap.

    `num_colors` is part of the signature for wizard backward-compat
    but ignored — see module docstring on the future palette map.

    `on_phase(name)` is the optional phase-timer hook. Returns
    (svg_string, cropped_png_bytes, region_count).
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    img_w, img_h = img.size

    # Crop to the grid region. Round to integer pixel bounds for the
    # PIL crop; the SVG below uses the same integer-pixel crop so
    # cell placement stays precise against the returned bitmap.
    cx0 = max(0, round(crop_x))
    cy0 = max(0, round(crop_y))
    cx1 = min(img_w, round(crop_x + crop_w))
    cy1 = min(img_h, round(crop_y + crop_h))
    cropped = img.convert("RGB").crop((cx0, cy0, cx1, cy1))
    phase("crop")

    # Integer pixel dimensions of the cropped bitmap — these define
    # both the SVG viewBox and the trace_base image rows in the DB.
    cropped_w_px, cropped_h_px = cropped.size

    # Downsample straight to the cell grid: 1 cell = 1 px, each
    # cell the area-average of its source block.
    cell_grid = cropped.resize((cells_x, cells_y), Image.BOX)
    phase("downsample")

    # FUTURE (separate PR): map each cell colour to its nearest
    # neighbour in the gruf.io fixed palette (140 colours + 48
    # greys). Insertion point:
    #
    #     cell_grid = map_to_grufio_palette(cell_grid)
    #
    # No median-cut quantise here — that would first pick random
    # palette colours and then re-map to the fixed one (double
    # loss). Direct mean → palette is single-step.

    arr = np.asarray(cell_grid, dtype=np.uint8)  # (cells_y, cells_x, 3)
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

    grid = _grid_lines(cropped_w_px, cropped_h_px, cells_x, cells_y, stroke_width)
    phase("lines")

    # Cell coordinates → scaled to the cropped bitmap's size. No
    # translate: the SVG's viewBox is the crop, the bitmap returned
    # to the caller is the crop, the editor stacks them 1:1.
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

    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    cropped_png = buf.getvalue()
    phase("encode_cropped")

    return svg_content, cropped_png, region_count
