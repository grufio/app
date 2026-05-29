"""
Circulate filter pipeline — direct SVG renderer.

Produces a Chuck-Close-style dot-grid SVG from a source image:

  1. Crop the source to the resolved grid region.
  2. Downsample straight to a cells_x × cells_y bitmap (one pixel per
     cell, area-averaged via Image.BOX) — the SHARED colour contract
     (`cell_colors.py`), identical to Pixelate.
  3. Snap each cell mean to the nearest palette chip (outer fill); when
     an inner ellipse is enabled, snap the *hue-shifted* cell mean to a
     chip too (inner fill — palette-constrained, never leaves the palette).
  4. Emit one `<g data-cell="x,y">` per cell containing an outer
     `<ellipse>` (+ optional inner `<ellipse>`), drawn in CROP-PIXEL space
     at the cell centre. Contours are the ellipse stroke — there are NO
     grid lines (contour replaces the grid).

Geometry is mm-agnostic here: the server (`resolveCirculateGrid`) does all
the mm math and passes the ellipse sizes as FRACTIONS of the cell pitch
(0..1) plus the contour stroke as a pixel width. Drawing in crop-pixel space
(not a non-uniform `scale()` group like Pixelate) keeps the ellipse stroke
uniform — a scaled group would distort the contour into an ellipse.

Like Pixelate, the cropped bitmap is returned alongside the SVG so the
viewBox lines up 1:1 with it. The SVG background between circles is
transparent (no background rect); the editor decides what sits underneath.
"""
from __future__ import annotations

import io

import numpy as np
from PIL import Image

from .cell_colors import compute_cell_colors, map_cells_to_palette
from .cell_texture import apply_neighbor_invasion
from .oklab import adjust_oklab, nearest_palette_indices, rgb255_to_oklab


def _hex(rgb) -> str:
    r, g, b = int(rgb[0]), int(rgb[1]), int(rgb[2])
    return f"#{r:02x}{g:02x}{b:02x}"


def _inner_colors(
    cell_means: np.ndarray,
    palette_oklab,
    palette_rgb,
    inner_hue_deg: float,
    inner_lightness_delta: float,
    inner_chroma_scale: float,
) -> np.ndarray:
    """Inner-ellipse colour per cell: the cell mean is adjusted by the chosen
    sub colour filter (OKLab hue/lightness/chroma deltas, resolved by the Node
    server), then snapped to the nearest palette chip. Returns
    `(cells_y, cells_x, 3)` uint8. Without a palette the raw means are used
    (no adjustment possible — nothing to snap back to).
    """
    if palette_oklab is None or palette_rgb is None:
        return np.asarray(cell_means, dtype=np.uint8)
    shape = np.asarray(cell_means).shape
    means_oklab = rgb255_to_oklab(np.asarray(cell_means).reshape(-1, 3))
    adjusted = adjust_oklab(means_oklab, inner_hue_deg, inner_lightness_delta, inner_chroma_scale)
    idx = nearest_palette_indices(adjusted, palette_oklab)
    return np.asarray(palette_rgb, dtype=np.uint8)[idx].reshape(shape)


def circulate_to_svg(
    img: Image.Image,
    cells_x: int,
    cells_y: int,
    crop_x: float,
    crop_y: float,
    crop_w: float,
    crop_h: float,
    outer_w_frac: float,
    outer_h_frac: float,
    inner_enabled: bool = False,
    inner_w_frac: float = 0.5,
    inner_h_frac: float = 0.5,
    contour_width_px: float = 0.0,
    inner_hue_deg: float = 0.0,
    inner_lightness_delta: float = 0.0,
    inner_chroma_scale: float = 1.0,
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    texture_enabled: bool = False,
    texture_strength: float = 0.0,
    on_phase: callable | None = None,
) -> tuple[str, bytes, int]:
    """
    Build the circulate SVG + cropped bitmap from the server-resolved grid.

    `cells_x/_y` + `crop_*` come pre-resolved by `resolveCirculateGrid`. The
    ellipse `*_frac` are the axis sizes as a fraction of the cell pitch (0..1);
    `contour_width_px` is the stroke width in crop-pixel space (0 = no contour).
    `palette_oklab` (M, 3) + `palette_rgb` (M, 3) are the active palette chips;
    when present each cell snaps to its nearest chip. Returns
    (svg_string, cropped_png_bytes, region_count) where region_count is the
    cell count (one paint-by-numbers group per cell).
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    img_w, img_h = img.size

    # Crop to the grid region (integer pixel bounds), identical to Pixelate so
    # the returned bitmap and the SVG viewBox share the same crop.
    cx0 = max(0, round(crop_x))
    cy0 = max(0, round(crop_y))
    cx1 = min(img_w, round(crop_x + crop_w))
    cy1 = min(img_h, round(crop_y + crop_h))
    cropped = img.convert("RGB").crop((cx0, cy0, cx1, cy1))
    phase("crop")

    cropped_w_px, cropped_h_px = cropped.size

    # Per-cell area-average (shared colour contract): 1 cell = 1 px.
    means = compute_cell_colors(cropped, cells_x, cells_y)  # (cells_y, cells_x, 3)
    phase("downsample")

    # Outer fill = nearest palette chip (raw means when no palette).
    if palette_oklab is not None and palette_rgb is not None:
        outer = map_cells_to_palette(means, palette_oklab, palette_rgb)
        # Optional blue-noise texture step on the OUTER cells — breaks up
        # large monochromatic islands. Inner ellipses keep their derived
        # colour (the sub colour filter snap is independent of the outer
        # invasion). Only runs when a palette is present (the algorithm
        # picks invading chips from `palette_rgb`).
        if texture_enabled and texture_strength > 0:
            outer = apply_neighbor_invasion(
                outer, np.asarray(palette_rgb, dtype=np.uint8), texture_strength
            )
    else:
        outer = np.asarray(means, dtype=np.uint8)
    inner = (
        _inner_colors(
            means, palette_oklab, palette_rgb,
            inner_hue_deg, inner_lightness_delta, inner_chroma_scale,
        )
        if inner_enabled
        else None
    )
    phase("palette")

    # One cell occupies (cell_px_w × cell_px_h) of the crop bitmap. Ellipses
    # are centred in their cell; radius = half the cell extent × the fraction.
    cell_px_w = cropped_w_px / cells_x
    cell_px_h = cropped_h_px / cells_y
    outer_rx = outer_w_frac * cell_px_w / 2.0
    outer_ry = outer_h_frac * cell_px_h / 2.0
    inner_rx = inner_w_frac * cell_px_w / 2.0
    inner_ry = inner_h_frac * cell_px_h / 2.0
    stroke = (
        f' stroke="black" stroke-width="{contour_width_px:.4f}"'
        if contour_width_px > 0
        else ""
    )

    groups: list[str] = []
    for y in range(cells_y):
        cyp = (y + 0.5) * cell_px_h
        for x in range(cells_x):
            cxp = (x + 0.5) * cell_px_w
            parts = [
                f'<ellipse cx="{cxp:.4f}" cy="{cyp:.4f}" '
                f'rx="{outer_rx:.4f}" ry="{outer_ry:.4f}" '
                f'fill="{_hex(outer[y, x])}"{stroke}/>'
            ]
            if inner is not None:
                parts.append(
                    f'<ellipse cx="{cxp:.4f}" cy="{cyp:.4f}" '
                    f'rx="{inner_rx:.4f}" ry="{inner_ry:.4f}" '
                    f'fill="{_hex(inner[y, x])}"{stroke}/>'
                )
            groups.append(f'<g data-cell="{x},{y}">{"".join(parts)}</g>')
    phase("render")

    region_count = cells_x * cells_y

    # No `scale()` group, no grid lines — ellipses are already in crop-pixel
    # space and contours replace the grid. Transparent background between
    # circles.
    svg_content = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{cropped_w_px}" height="{cropped_h_px}" '
        f'viewBox="0 0 {cropped_w_px} {cropped_h_px}">\n'
        f'  <g id="cells">\n'
        f'    {chr(10).join(groups)}\n'
        f'  </g>\n'
        f'</svg>'
    )
    phase("serialize")

    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    cropped_png = buf.getvalue()
    phase("encode_cropped")

    return svg_content, cropped_png, region_count
