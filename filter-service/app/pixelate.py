"""
Pixelate filter pipeline — direct SVG renderer.

Single entry point `pixelate_cells_to_svg`: the caller (Vercel server) has
already cropped + area-averaged the source to a `cells_y × cells_x × 3` uint8
grid. This function just snaps each cell to the nearest palette chip and
emits one `<rect>` per cell + grid lines. The whole job is small-array numpy
+ string concatenation — milliseconds.

No quantise, no vtracer — every cell boundary stays pixel-perfect
axis-aligned by construction.
"""
from __future__ import annotations

import numpy as np

from .cell_colors import map_cells_dithered
from .cell_labels import build_label_map, reconstruct_palette_indices, render_numbers_group
from .cell_texture import apply_neighbor_invasion
from .palette_reduction import reduce_to_top_n


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
    num_colors: int | None = None,
    pre_snap_chroma_scale: float = 1.0,
    texture_enabled: bool = False,
    texture_strength: float = 0.0,
    dither_mode: str = "none",
    dither_pattern_size: int = 4,
    on_phase: callable | None = None,
) -> tuple[str, int, list[int]]:
    """
    Render the pixelate SVG from a pre-computed per-cell colour grid.

    `cell_means` is a `(cells_y, cells_x, 3)` uint8 RGB array — the
    area-averaged per-cell colours, computed by the caller (Vercel server's
    `cellAreaAverages` on a `sharp(...).raw()` crop). `cropped_w_px` and
    `cropped_h_px` are the cropped-source pixel dimensions used for the
    SVG viewBox and the cell-to-pixel scale.

    `palette_oklab` + `palette_rgb`: when both are given, each cell is
    snapped to its nearest chip; when omitted, raw area-average means
    are emitted.

    Returns `(svg_string, region_count)`. The cropped PNG is the caller's
    responsibility (the Vercel server already has it from sharp).
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    cells_y, cells_x, _ = cell_means.shape
    arr = cell_means

    if palette_oklab is not None and palette_rgb is not None:
        # PR-F: single dispatch — `"none"` keeps the pre-feature snap;
        # `"knoll_yliluoma"` / `"floyd_steinberg"` substitute the snap
        # step with the matching dithering algorithm. The texture step
        # below is skipped when dithering is on (KY/FS replace it
        # functionally; stacking would double-dither).
        arr = map_cells_dithered(
            arr, palette_oklab, palette_rgb,
            pre_snap_chroma_scale=pre_snap_chroma_scale,
            dither_mode=dither_mode,
            dither_pattern_size=dither_pattern_size,
        )
        phase("palette")
        # Optional blue-noise texture step — sporadic neighbour-cluster
        # invasions to break up large monochromatic islands. No-op when
        # the user has the checkbox off OR when dithering is on (the
        # dither output already provides the spatial-quantization
        # behaviour that texture was approximating).
        if dither_mode == "none" and texture_enabled and texture_strength > 0:
            arr = apply_neighbor_invasion(
                arr, np.asarray(palette_rgb, dtype=np.uint8), texture_strength
            )
            phase("texture")
        arr, did_reduce = reduce_to_top_n(arr, palette_oklab, palette_rgb, num_colors)
        if did_reduce:
            phase("reduce_colors")
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

    # Paint-by-numbers labels: one `<text>` per cell in CROP-PIXEL space
    # (outside the colors scale group → non-square supercells don't squish
    # the digits). Labels recover palette indices from the *final* cells
    # (post-snap, post-texture) so a texture-replaced cell gets the
    # invading chip's label, not the original. Only emitted when a palette
    # was supplied; otherwise the layer's silently absent and the client
    # toggle is a no-op.
    numbers_group = ""
    palette_indices_used: list[int] = []
    if palette_rgb is not None:
        indices = reconstruct_palette_indices(arr, np.asarray(palette_rgb, dtype=np.uint8))
        labels = build_label_map(indices)
        numbers_group = render_numbers_group(indices, labels, scale_x, scale_y)
        # Unique palette chips actually used in the final output (after
        # snap + texture invasion). Sorted ascending by palette_index so
        # the client renders them deterministically.
        palette_indices_used = sorted(int(i) for i in np.unique(indices).tolist())
        phase("numbers")

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
        f'  {numbers_group}\n'
        f'</svg>'
    )
    phase("serialize")

    return svg_content, region_count, palette_indices_used
