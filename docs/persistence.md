## Persistence model (editor MVP)

This doc describes what the editor persists to the database vs what is kept local-only.

### Canonical principles

- **µpx (micro-pixels)** are the canonical numeric format for persisted geometry.
  - Stored as string-encoded `bigint` values (`*_px_u`) to avoid precision loss.
- Cached integer pixel columns (e.g. `width_px`) exist for convenience/perf and are derived from µpx.

### Persisted (database)

#### Workspace (artboard + page-level settings)

Table: `public.project_workspace`

- **Artboard size**:
  - `width_px_u`, `height_px_u` (canonical)
  - `width_px`, `height_px` (cached integer px)
  - `unit`, `width_value`, `height_value` (user-facing unit inputs)
- **Resolution**:
  - `dpi_x`, `dpi_y`
  - `raster_effects_preset`
- **Page background**:
  - `page_bg_enabled`
  - `page_bg_color` (hex)
  - `page_bg_opacity` (0–100)

#### Grid

Table: `public.project_grid`

- `unit`
- `spacing_value`, `spacing_x_value`, `spacing_y_value`
- `line_width_value`
- `color`

#### Image transform (master role)

Table: `public.project_image_state`

- `width_px_u`, `height_px_u` (canonical size of the placed image)
- `x_px_u`, `y_px_u` (position)
- `rotation_deg`
- `role` (currently `master`)

#### Image metadata

Table: `public.project_images`

- `width_px`, `height_px` (intrinsic pixel dimensions of the uploaded image)
- `storage_path`, `format`, `file_size_bytes`
- `role` (`master`)

### Local-only (not persisted)

These are currently treated as session/UI state:

- Panel widths (left/right)
- Navigation selection (`selectedNavId`)
- Tool selection (move/scale/etc.) and transient interaction state
- Konva view state that can be re-derived (zoom/pan defaults)

### What should NOT be persisted to image-state

- Workspace-level settings like DPI, units, or page background.
  - Those belong to `project_workspace`.

