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
from .cell_labels import build_label_map, reconstruct_palette_indices, render_numbers_group
from .cell_texture import apply_neighbor_invasion
from .oklab import nearest_palette_indices, rgb255_to_oklab


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
    texture_enabled: bool = False,
    texture_strength: float = 0.0,
    on_phase: callable | None = None,
) -> tuple[str, int, list[int]]:
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
        # Optional blue-noise texture step — sporadic neighbour-cluster
        # invasions to break up large monochromatic islands. No-op when
        # the user has the checkbox off; the chip set never expands (the
        # invading colour is always a palette chip).
        if texture_enabled and texture_strength > 0:
            arr = apply_neighbor_invasion(
                arr, np.asarray(palette_rgb, dtype=np.uint8), texture_strength
            )
            phase("texture")
        # Cap distinct chip count: if the snap (plus any texture
        # invasion) produced more distinct chips than the user-set
        # `num_colors`, keep the top-N most-used and re-snap the rest
        # to the nearest chip in the kept set. Top-by-count is a
        # stable, dominant-preserving reduction — a future k-medoid
        # / spread-aware pick could refine clustered outputs.
        if num_colors is not None and num_colors > 0:
            palette_rgb_arr = np.asarray(palette_rgb, dtype=np.uint8)
            pre_indices = reconstruct_palette_indices(arr, palette_rgb_arr)
            unique, counts = np.unique(pre_indices, return_counts=True)
            if len(unique) > num_colors:
                top_n = unique[np.argsort(counts)[-num_colors:]]
                top_n_rgb = palette_rgb_arr[top_n]
                top_n_oklab = np.asarray(palette_oklab, dtype=np.float32)[top_n]
                excluded_mask = ~np.isin(pre_indices, top_n)
                if excluded_mask.any():
                    flat = arr.reshape(-1, 3).copy()
                    excluded_flat = excluded_mask.flatten()
                    excluded_oklab = rgb255_to_oklab(flat[excluded_flat])
                    local = nearest_palette_indices(excluded_oklab, top_n_oklab)
                    flat[excluded_flat] = top_n_rgb[local]
                    arr = flat.reshape(arr.shape)
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


def pixelate_to_svg(
    img: Image.Image,
    cells_x: int,
    cells_y: int,
    crop_x: float,
    crop_y: float,
    crop_w: float,
    crop_h: float,
    stroke_width: float,
    num_colors: int = 16,
    palette_oklab: list | None = None,
    palette_rgb: list | None = None,
    texture_enabled: bool = False,
    texture_strength: float = 0.0,
    on_phase: callable | None = None,
) -> tuple[str, bytes, int, list[int]]:
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

    svg_content, region_count, palette_indices_used = pixelate_cells_to_svg(
        cell_means=cell_means,
        cropped_w_px=cropped_w_px,
        cropped_h_px=cropped_h_px,
        palette_oklab=palette_oklab,
        palette_rgb=palette_rgb,
        num_colors=num_colors,
        texture_enabled=texture_enabled,
        texture_strength=texture_strength,
        on_phase=on_phase,
    )

    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    cropped_png = buf.getvalue()
    phase("encode_cropped")

    return svg_content, cropped_png, region_count, palette_indices_used
