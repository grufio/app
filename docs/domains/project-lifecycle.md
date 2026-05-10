# Project Lifecycle

## Purpose

A "project" is the top-level container in gruf.io: it owns a
workspace (canvas size, DPI, unit), a pile of images (master,
working, asset, filter-working-copy), filter chains, and a set of
generated artifacts. This domain covers how projects come into
existence, how they're listed, and how they go away — atomic, with
cascades that cross every other domain.

## Where it lives

- [services/projects/server/create-project.ts](../../services/projects/server/create-project.ts)
  — `createProjectWithWorkspace()` validates input + inserts the
  `projects` and `project_workspace` rows in one server-side flow.
- [services/projects/server/dashboard.ts](../../services/projects/server/dashboard.ts)
  — list-projects query for the dashboard.
- [services/projects/client/](../../services/projects/client/) —
  `create-project.ts`, `delete-project.ts`, `get-project.ts`,
  `update-project-title.ts` — typed client wrappers around the API.
- [app/api/projects/create/route.ts](../../app/api/projects/create/route.ts)
  — the create endpoint (POST).
- [app/api/projects/[projectId]/route.ts](../../app/api/projects/%5BprojectId%5D/route.ts)
  — read + delete on a single project.
- DB: [db/schema.sql:209-247](../../db/schema.sql) defines the
  `delete_project(uuid)` RPC. `project_workspace` and
  `project_generation` tables sit alongside `projects` and cascade.

## Key concepts

- **Hard delete with advisory lock.** `delete_project` is a SECURITY
  DEFINER RPC that takes `pg_advisory_xact_lock(hashtext(project_id))`
  to serialize concurrent deletes against any RPC that reads/writes
  the same project (notably `set_active_master_with_state`). The lock
  releases at transaction end.
- **No soft-delete on `projects` itself.** `projects` rows are removed
  outright. Soft-delete via `deleted_at` exists on
  **`project_images`** (so that lineage queries can still join past
  rows), not on the project container.
- **Master-immutable bypass during teardown.** `delete_project` sets
  `app.deleting_project = <project_id>` via `set_config(..., true)`.
  The `guard_master_immutable` trigger checks for this and lets the
  cascade-delete touch the master row even though the trigger
  normally rejects edits to it.
- **Filters cleaned up explicitly first.** The RPC deletes
  `project_image_filters` before deleting the `projects` row even
  though FK cascade would do it — explicit order keeps the audit
  trail of which child died first if the cascade ever fails mid-flight.
- **Owner check before any work.** The RPC's first action after the
  lock is `select owner_id ... if null → raise 'project not found'`.
  RLS on the wrapping client adds a second layer; the RPC itself
  also enforces ownership defensively.

## Data flow — delete

```
client/delete-project.ts
   ↓ supabase.rpc('delete_project', { p_project_id })
DB:  pg_advisory_xact_lock(hash(project_id))
   → SELECT owner_id ... → 404 if null
   → set_config('app.deleting_project', project_id, true)
   → DELETE FROM project_image_filters WHERE project_id = ...
   → DELETE FROM projects WHERE id = ... RETURNING id
   ↑ guard_master_immutable trigger checks app.deleting_project,
     allows the cascade
FK cascade then removes project_images, project_workspace,
project_image_state, project_generation rows
```

## Data flow — create

```
POST /api/projects/create  (with auth cookie)
   → services/projects/server/create-project.ts
     ├── validate unit/width/height/dpi
     ├── compute width_px_u/height_px_u via lib/editor/units
     ├── INSERT INTO projects (owner_id = current_user, name)
     └── INSERT INTO project_workspace (project_id, dpi, dimensions)
   → 200 { projectId }
```

## Conventions

- **All write operations against a project go through the typed
  client wrappers in `services/projects/client/`** — never call
  Supabase RPCs from a React component directly.
- **Never raise a soft-delete on `projects` itself.** If user-facing
  "trash bin" is needed later, add a `archived_at` column rather
  than reusing `deleted_at` (which has different semantics on
  `project_images`).
- **Master-image guard awareness.** Any new RPC that edits the
  master row must respect `guard_master_immutable`. To bypass
  legitimately (e.g. user-initiated full-project clear), set the
  `app.deleting_project` GUC the same way `delete_project` does.

## Common pitfalls

- **Creating projects without the workspace row.** A `projects` row
  without its matching `project_workspace` is invalid — every
  editor-load query joins them. `createProjectWithWorkspace` does
  both atomically; don't bypass it.
- **Calling `set_active_master_with_state` mid-delete.** The
  advisory lock serializes them so the second one waits, but if the
  caller has its own timeout it may give up. Rare; mention in the
  caller's retry logic if needed.
- **Trying to query a soft-deleted `project_images` row.** Add
  `and deleted_at is null` to your filter — most existing queries
  already do this. RLS doesn't filter by `deleted_at`.

## Cross-references

- [docs/domains/image-editor.md](image-editor.md) — what hangs off a
  project.
- [docs/domains/auth-rls.md](auth-rls.md) — owner-only RLS that
  protects each project.
- [docs/domains/database.md](database.md) — schema for `projects`,
  `project_workspace`, `project_generation`.
- DB: [db/schema.sql:209](../../db/schema.sql) `delete_project` RPC,
  [db/schema.sql:1523](../../db/schema.sql) `project_generation`
  constraints.
