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

### Image workflow state contract (XState scope)

Image workflow orchestration is handled by `lib/editor/machines/image-workflow.machine.ts` with a narrow editor scope:

- Source read-model states: `loading | ready | empty | error`
- Mutation flow states: `idle | removingFilter | cropping | restoring | syncing | error`
- Transform persistence states: `idle | persisting | drain | error`

Core events:

- `BOOT`, `REFRESH` provide explicit lifecycle hooks for shell orchestration.
- `SOURCE_SNAPSHOT` updates read-model from server-driven working image loading.
- `FILTER_APPLY`, `FILTER_REMOVE`, `CROP_APPLY`, `RESTORE` run mutations through service adapters.
- `TRANSFORM_SAVE` writes image transform with latest-wins queueing (`inFlight` + `pending`).

Design rules:

- Canvas edits require an active `ready` source image.
- Every mutation success flows through one centralized `syncing` refresh.
- Error details are normalized through machine context (`lastOpError`, `lastPersistenceError`) and surfaced by UI toast handling.

### Do-not-break invariants (workflow contract)

- `ProjectEditorShell` dispatches image mutations through the machine contract (`FILTER_APPLY`, `FILTER_REMOVE`, `CROP_APPLY`, `RESTORE`, `TRANSFORM_SAVE`) instead of ad-hoc direct mutation paths.
- Exactly one active non-deleted image exists per project, and the active image must be reachable from a master root through `source_image_id`.
- `New Filter` UI availability is derived from a single guard (`has ready source image` and `not busy`) so button and action icon never drift apart.
- Restore error UI is scoped to restore transitions; filter/crop errors must not leak into restore panels.
- `No working image available` is emitted as a dedicated telemetry signal (`domain=image_workflow`, `metric=no_working_image_available`) to keep drift incidents diagnosable.
- Dashboard `initialImageTransform` must be matched by `project_image_state.image_id === master_image.id`; do not use `project_image_state.role` as primary selector (historical field, not unique per project).

