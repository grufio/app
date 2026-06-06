"""
Circulate filter pipeline — direct SVG renderer.

Single entry point `circulate_cells_to_svg`: the caller (Vercel server) has
already cropped + area-averaged the source to a `cells_y × cells_x × 3` uint8
grid via `sharp().raw()` + `cellAreaAverages`. This function just snaps each
cell to a palette chip, optionally applies the texture step on the OUTER
cells, then emits one ellipse-group per cell. Small-array numpy + string
concatenation — milliseconds.

Geometry is mm-agnostic here: the server (`resolveCirculateGrid`) does all
the mm math and passes the ellipse sizes as FRACTIONS of the cell pitch
(0..1) plus the contour stroke as a pixel width. Drawing in crop-pixel space
(not a non-uniform `scale()` group like Pixelate) keeps the ellipse stroke
uniform — a scaled group would distort the contour into an ellipse.
"""
from __future__ import annotations

import numpy as np

from .cell_colors import map_cells_dithered
from .cell_labels import build_label_map, reconstruct_palette_indices, render_numbers_group
from .cell_texture import apply_neighbor_invasion
from .oklab import adjust_oklab, nearest_palette_indices, rgb255_to_oklab
from .palette_reduction import reduce_to_top_n


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


def circulate_cells_to_svg(
    cell_means: np.ndarray,
    cropped_w_px: int,
    cropped_h_px: int,
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
    num_colors: int | None = None,
    pre_snap_chroma_scale: float = 1.0,
    texture_enabled: bool = False,
    texture_strength: float = 0.0,
    dither_mode: str = "none",
    dither_pattern_size: int = 4,
    on_phase: callable | None = None,
) -> tuple[str, int, list[int]]:
    """
    Render the circulate SVG from a pre-computed per-cell colour grid.

    `cell_means` is the `(cells_y, cells_x, 3)` uint8 RGB array — the
    area-averaged per-cell colours computed by the Vercel server. The inner
    ellipse colours are derived from the (pre-snap) means, so the texture
    step on the outer cells doesn't propagate into the inner sub-colour
    adjustment.

    Returns `(svg_string, region_count)`. The cropped PNG is the caller's
    responsibility (the Vercel server already has it from sharp).
    """

    def phase(name: str) -> None:
        if on_phase is not None:
            on_phase(name)

    cells_y, cells_x, _ = cell_means.shape
    means = cell_means

    # Outer fill = nearest palette chip (raw means when no palette).
    # Pre-snap chroma boost only applies to OUTER ellipses; the INNER
    # ellipse keeps its derived sub-colour math (see `_inner_colors`).
    if palette_oklab is not None and palette_rgb is not None:
        # PR-F: single dispatch for the outer ellipse colour — `"none"`
        # keeps the pre-feature snap; `"knoll_yliluoma"` /
        # `"floyd_steinberg"` substitute the snap step with the matching
        # dithering algorithm. Inner ellipse colour is derived from the
        # *original* (pre-dither, pre-snap) means below — unchanged.
        outer = map_cells_dithered(
            means, palette_oklab, palette_rgb,
            pre_snap_chroma_scale=pre_snap_chroma_scale,
            dither_mode=dither_mode,
            dither_pattern_size=dither_pattern_size,
        )
        # Optional blue-noise texture step on the OUTER cells. No-op when
        # the checkbox is off OR when dithering is on (the dither output
        # already provides the spatial-quantization behaviour that
        # texture was approximating).
        if dither_mode == "none" and texture_enabled and texture_strength > 0:
            outer = apply_neighbor_invasion(
                outer, np.asarray(palette_rgb, dtype=np.uint8), texture_strength
            )
        # Reduce on the OUTER cells only — inner sub-colour is decorative
        # and tracks the original mean.
        outer, did_reduce = reduce_to_top_n(outer, palette_oklab, palette_rgb, num_colors)
        if did_reduce:
            phase("reduce_colors")
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

    # Per-cell frame layer: one thin black ellipse outline per cell,
    # always present, never toggled. Pixelate's `<g id="grid">` plays
    # the same role on the rect side; circulate has no grid concept, so
    # this is the equivalent. Frames stay even when other layers are
    # hidden so the number-to-cell association is never lost.
    frames: list[str] = []
    for y in range(cells_y):
        cyp = (y + 0.5) * cell_px_h
        for x in range(cells_x):
            cxp = (x + 0.5) * cell_px_w
            frames.append(
                f'<ellipse cx="{cxp:.4f}" cy="{cyp:.4f}" '
                f'rx="{outer_rx:.4f}" ry="{outer_ry:.4f}" '
                f'fill="none" stroke="black" stroke-width="1"/>'
            )

    # Paint-by-numbers labels on the OUTER cells. Labels recover palette
    # indices from `outer` (post-snap, post-texture) so a texture-replaced
    # cell gets the invading chip's label. Skipped when no palette was
    # supplied — the layer is silently absent and the client toggle is a
    # no-op.
    numbers_group = ""
    palette_indices_used: list[int] = []
    if palette_rgb is not None:
        indices = reconstruct_palette_indices(outer, np.asarray(palette_rgb, dtype=np.uint8))
        labels = build_label_map(indices)
        numbers_group = render_numbers_group(indices, labels, cell_px_w, cell_px_h)
        # Unique palette chips actually used in the final output. Sorted
        # ascending by palette_index so the client renders them
        # deterministically. Mirrors the pixelate convention.
        palette_indices_used = sorted(int(i) for i in np.unique(indices).tolist())
        phase("numbers")

    # Stacking order: cells (filled) → frames (outline) → numbers (digits).
    # Numbers sit on top so digits remain legible above the frame stroke.
    svg_content = (
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{cropped_w_px}" height="{cropped_h_px}" '
        f'viewBox="0 0 {cropped_w_px} {cropped_h_px}">\n'
        f'  <g id="cells">\n'
        f'    {chr(10).join(groups)}\n'
        f'  </g>\n'
        f'  <g id="frames">\n'
        f'    {chr(10).join(frames)}\n'
        f'  </g>\n'
        f'  {numbers_group}\n'
        f'</svg>'
    )
    phase("serialize")

    return svg_content, region_count, palette_indices_used
