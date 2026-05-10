## Pixel-only Editor Geometry Contract

### Canonical geometry (Editor)
- **Artboard geometry is pixel-only**.
- Canonical persisted fields are **`width_px_u` / `height_px_u`** (µpx) and derived **`width_px` / `height_px`**.
- Image transforms are pixel-only (`x_px_u/y_px_u/width_px_u/height_px_u/rotation_deg`).

### Output-only DPI
- **DPI is only relevant for output** (PDF/export/print).
- Persist output DPI as **`project_workspace.output_dpi`**.

### Hard rules (must not regress)
- **No code path may scale editor geometry by DPI**.
- **No DB trigger may recompute `width_px_u/height_px_u` from `width_value/unit/(output_dpi|artboard_dpi)` on UPDATE**.
- Unit/value fields (`unit`, `width_value`, `height_value`) are **display/output meta** only and must be treated as derived, not canonical.

