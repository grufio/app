# Image State

## Purpose

`project_image_state` binds the active master image to its placement
on the artboard (x/y/width/height/rotation, all in `text` µpx units
to dodge floating-point drift). One row per project. Updates flow
through the `set_active_master_with_state` RPC for atomic image+state
swaps.

## Where it lives

- [lib/supabase/image-state.ts](../../lib/supabase/image-state.ts)
  — typed read/write helpers, NOT-NULL guards on `width_px_u`/`height_px_u`.
- DB table `public.project_image_state` — defined in the squashed
  baseline; `image_id` NOT NULL FK to `project_images`,
  `width_px_u`/`height_px_u` NOT NULL since the close-prod-drift
  migration.
- RPC `public.set_active_master_with_state(p_project_id, p_image_id,
  p_x_px_u, p_y_px_u, p_width_px_u, p_height_px_u)` — the only
  blessed write path.
- Callers: [lib/supabase/project-images.ts:249](../../lib/supabase/project-images.ts),
  [app/api/projects/[projectId]/images/master/restore/route.ts:123](../../app/api/projects/%5BprojectId%5D/images/master/restore/route.ts).

## Key invariants

- All coords + sizes are stored as `text` micro-pixels (`*_px_u`),
  not numeric. Conversions live in [lib/editor/units.ts](../../lib/editor/units.ts)
  and [lib/editor/numeric.ts](../../lib/editor/numeric.ts).
- `image_id` and the four `*_px_u` columns are NOT NULL. Reads that
  touch them assume non-null; defensive null-checks elsewhere are
  legacy (cleaned up in the close-prod-drift PR).

## Cross-references

- **Persistence model overview:**
  [docs/reference/persistence.md](../reference/persistence.md)
- **Formal API contract:**
  [docs/specs/image-state-api.mdx](../specs/image-state-api.mdx)
- **Sizing invariants (`px_u` semantics):**
  [docs/specs/sizing-invariants.mdx](../specs/sizing-invariants.mdx)
- **Related domain docs:**
  [domains/image-editor.md](image-editor.md),
  [domains/storage.md](storage.md)
