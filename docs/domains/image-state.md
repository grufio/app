# Image State

## Purpose

`project_image_state` holds the user's canvas transform
(x/y/width/height/rotation, all in `text` µpx units to dodge
floating-point drift) for the project's image. Exactly
**one row per project**, keyed by the project's `working_copy.id`.
Editor operations on any surface (filter chain tip, trace output)
resolve to the working_copy row before reading or writing — the
state outlives every filter-base-copy recreation, chain reset, or
trace tombstone.

> Anchor history: state was originally anchored at `master.id`
> (PR #124). It was re-anchored to `working_copy.id` in PR #257
> (migration `20260521201811_state_anchor_working_copy.sql`); the
> master row is immutable and no longer carries the transform.

The `working_copy` image row itself is **lazy**: master upload no
longer auto-creates it. A working_copy materialises on the first
filter-apply via
[services/editor/server/working-copy/ensure.ts](../../services/editor/server/working-copy/ensure.ts)
(server-side `storage.copy()` from the master). Until then, the
master is the canvas display source — the `master/list` route
returns master.id as `display_target.active_image_id` when no
working_copy exists.

## Where it lives

- [lib/supabase/image-state.ts](../../lib/supabase/image-state.ts)
  — typed read/write helpers (`loadBoundImageState`,
  `upsertBoundImageState`), NOT-NULL guards on
  `width_px_u`/`height_px_u`. These take an `image_id` argument
  but every editor caller routes through the API route below
  which resolves to working_copy.id first.
- [lib/supabase/image-state.ts:resolveStateAnchorImage](../../lib/supabase/image-state.ts)
  — the resolver every editor path uses to find the project's
  state anchor; selects the `kind='working_copy'` row (PR #257).
- [app/api/projects/[projectId]/image-state/route.ts](../../app/api/projects/%5BprojectId%5D/image-state/route.ts)
  — canonical read/write surface for editor transforms. Both GET
  and POST resolve to working_copy.id; the body's `image_id` field is
  treated as informational (used for the in-project + lock-guard
  check, never as the persistence key).
- DB table `public.project_image_state` — primary key
  `(project_id, image_id)`; `image_id` is the working_copy row id
  (PR #257). `width_px_u`/`height_px_u` NOT NULL since the close-
  prod-drift migration.
- RPC `public.set_active_image_with_state` — links a `project_images`
  row to the `project_image_state` row in one transaction; used by
  the master-swap / restore flow only ([app/api/projects/[projectId]/images/master/restore/route.ts](../../app/api/projects/%5BprojectId%5D/images/master/restore/route.ts)).
  Day-to-day editor saves go through the image-state route.

## Key invariants

- **`image_id` is the project's `working_copy.id`.** The route
  resolves to it (via `resolveStateAnchorImage`) on every write;
  the migration `20260521201811_state_anchor_working_copy.sql`
  re-anchored existing rows from master.id. Direct upserts that
  bypass the route must resolve to working_copy.id themselves —
  there is no kind-level CHECK constraint enforcing this at the DB
  layer.
- All coords + sizes are stored as `text` micro-pixels (`*_px_u`),
  not numeric. Conversions live in
  [lib/editor/units.ts](../../lib/editor/units.ts) and
  [lib/editor/numeric.ts](../../lib/editor/numeric.ts).
- `image_id` and the four `*_px_u` columns are NOT NULL. Reads
  assume non-null; defensive null-checks elsewhere are legacy.

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
