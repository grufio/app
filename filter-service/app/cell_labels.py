"""
Per-cell number labels for the trace SVGs (paint-by-numbers key).

Each cell gets an integer label = its position in the sorted list of
unique palette indices actually used in this image. So a photo that
snapped to 7 distinct chips ends up with labels 1..7; two cells with
the same chip share the same number. The mapping is per-image and
order-stable (sorted by palette index).

Indices are recovered from the **final** post-snap (and post-texture)
RGB grid via reverse-lookup against `palette_rgb`. Mirrors
`cell_texture._reconstruct_palette_idx`: since every cell after the
snap is exactly one palette chip, packing R/G/B into a uint32 key and
searchsorted'ing against the sorted palette keys is O(N + M log M)
total. Recovering from final colours (not from pre-snap means) lets
the texture step — which replaces individual cells with a neighbour's
chip — get the correct label for the replaced cell.
"""
from __future__ import annotations

import numpy as np


def reconstruct_palette_indices(
    cells_rgb: np.ndarray, palette_rgb: np.ndarray
) -> np.ndarray:
    """Map each `(H, W, 3)` cell RGB to its `(H, W)` int32 palette
    index by exact-match reverse-lookup. Raises ValueError if any
    cell colour isn't a palette chip (shouldn't happen post-snap)."""
    cells = np.asarray(cells_rgb, dtype=np.uint8)
    palette = np.asarray(palette_rgb, dtype=np.uint8)
    if cells.ndim != 3 or cells.shape[2] != 3:
        raise ValueError("cells_rgb must have shape (H, W, 3)")
    if palette.ndim != 2 or palette.shape[1] != 3:
        raise ValueError("palette_rgb must have shape (M, 3)")

    def pack(arr: np.ndarray) -> np.ndarray:
        a32 = arr.astype(np.uint32)
        return (a32[..., 0] << 16) | (a32[..., 1] << 8) | a32[..., 2]

    cell_keys = pack(cells).ravel()
    pal_keys = pack(palette)

    order = np.argsort(pal_keys)
    sorted_keys = pal_keys[order]
    pos = np.searchsorted(sorted_keys, cell_keys)
    pos = np.clip(pos, 0, len(sorted_keys) - 1)
    matched = sorted_keys[pos] == cell_keys
    if not matched.all():
        raise ValueError(
            "reconstruct_palette_indices: cells_rgb contains colours not in palette_rgb"
        )
    return order[pos].reshape(cells.shape[:2]).astype(np.int32)


def build_label_map(palette_indices: np.ndarray) -> dict[int, int]:
    """Sorted unique palette indices → consecutive labels starting at 1.
    Deterministic ordering: smaller palette index = smaller label."""
    used = sorted({int(i) for i in palette_indices.ravel().tolist()})
    return {idx: pos + 1 for pos, idx in enumerate(used)}


def render_numbers_group(
    palette_indices: np.ndarray,
    label_map: dict[int, int],
    cell_px_w: float,
    cell_px_h: float,
) -> str:
    """Emit a `<g id="numbers">` group containing one `<text>` per cell
    at its centre in CROP-PIXEL space.

    Font size scales with the smaller cell dimension so labels stay
    readable for rectangular supercells. Pure `fill="black"` — no halo,
    no stroke. Legibility on light/dark chips relies on the per-cell
    frame layer (grid for pixelate, frames for circulate), not on a
    text outline. `pointer-events="none"` keeps the labels from
    intercepting canvas clicks meant for the cells underneath.
    """
    cells_y, cells_x = palette_indices.shape
    font_size = min(cell_px_w, cell_px_h) * 0.4
    items: list[str] = []
    for y in range(cells_y):
        cy_px = (y + 0.5) * cell_px_h
        for x in range(cells_x):
            idx = int(palette_indices[y, x])
            label = label_map[idx]
            cx_px = (x + 0.5) * cell_px_w
            items.append(
                f'<text x="{cx_px:.4f}" y="{cy_px:.4f}" '
                f'font-size="{font_size:.4f}" font-family="sans-serif" '
                f'text-anchor="middle" dominant-baseline="central" '
                f'fill="black" pointer-events="none">{label}</text>'
            )
    return f'<g id="numbers">\n    {chr(10).join(items)}\n  </g>'
