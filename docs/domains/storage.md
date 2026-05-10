# Storage

## Purpose

Every uploaded or generated image in gruf.io lives in Supabase
Storage and is referenced by a row in `public.project_images`. This
domain covers the bucket layout, path convention, RLS that keeps
images per-owner, and the master/working/asset/filter-working-copy
distinction in the `kind` column.

## Where it lives

- [lib/storage/buckets.ts](../../lib/storage/buckets.ts) —
  `PROJECT_IMAGES_BUCKET = "project_images"` constant. **All** code
  paths import this; SQL migrations keep the literal.
- [lib/storage/signed-url-ttl.ts](../../lib/storage/signed-url-ttl.ts)
  — TTL constants for signed URLs.
- [lib/supabase/project-images.ts](../../lib/supabase/project-images.ts)
  — typed helpers around the `project_images` table, plus
  `storage_path`/`storage_bucket` mapping.
- [services/editor/server/crop-image.ts](../../services/editor/server/crop-image.ts)
  — path construction (`projects/${projectId}/images/${imageId}`).
- [services/editor/server/master-image-upload/](../../services/editor/server/master-image-upload/)
  — server-side upload pipeline for the master image kind.
- [app/api/projects/[projectId]/images/master/route.ts](../../app/api/projects/%5BprojectId%5D/images/master/route.ts)
  — POST = upload master, GET = list, DELETE = soft-delete master.
- DB: `storage.objects` RLS policies live in a `DO`-block in the
  squashed baseline migration (preserved through every re-squash).

## Key concepts

- **One bucket, all kinds.** No per-kind bucket; the `kind` enum
  (`master | working_copy | filter_working_copy`, plus the legacy
  asset role tracked elsewhere) lives on `project_images.kind`.
  Bucket isolation isn't the access boundary — RLS via `auth.uid()`
  is.
- **Path convention** — every object key matches:
  ```
  projects/<projectId>/images/<imageId>
  ```
  This is enforced in two places: client-side path construction
  (e.g. `services/editor/server/crop-image.ts:142`) and the
  storage-RLS regex `^projects/[0-9a-fA-F-]{36}/images/…`. Don't
  invent new path shapes — RLS will silently reject reads.
- **`storage_path` and `storage_bucket` are duplicated on the row.**
  The actual key in storage is `<bucket>/<path>`, but we record both
  on `project_images` so deletes/audits don't have to re-derive them.
- **Soft-delete on `project_images`, not on storage.** Setting
  `deleted_at` on the row hides it; the storage object stays for
  collect-and-purge later via `collect_project_image_delete_targets`
  RPC. This decoupling lets the editor "undo delete" cheaply.
- **Master is immutable.** A `master` row's storage object is never
  overwritten — a new master gets a new `imageId` and the old one
  is soft-deleted. The `guard_master_immutable` trigger enforces
  this at the DB layer.

## Data flow — master image upload

```
client (browser) → POST /api/projects/<id>/images/master
                   (multipart: file + dpi_x + dpi_y)
   → services/editor/server/master-image-upload/
     ├── validate file format + size
     ├── compute width_px / height_px from file metadata
     ├── INSERT INTO project_images (kind='master', storage_path,
     │                                storage_bucket, dpi_x, dpi_y, …)
     │   storage_path = `projects/<projectId>/images/<newImageId>`
     ├── upload object to storage at storage_path
     └── set_active_master_with_state RPC ← binds to
                                            project_image_state
   → 200 { image_id }
```

## Conventions

- **Always use `PROJECT_IMAGES_BUCKET` constant.** Don't write
  `"project_images"` literally in TS — refactors break otherwise.
- **Always derive path via the `projects/<id>/images/<id>` pattern.**
  Using a different layout (e.g. `projects/<id>/master/foo.png`)
  fails RLS regex.
- **Soft-delete the row before unlinking storage.** Deleting
  storage first leaves orphaned `project_images` rows that show
  broken thumbnails until cleanup.
- **Service-role bypass is allowed only in
  `services/editor/server/filter-variants.ts:192`** for storage
  cleanup after soft-delete (owner client can't delete a soft-
  deleted row's storage object via RLS). See user memory:
  documented exception.

## Common pitfalls

- **Forgetting `kind` on insert.** Project_images has `kind NOT
  NULL` after the close-prod-drift migration. Older code that
  inserted only `role` will fail; use the new `kind` column.
- **Uploading before inserting the row.** If the upload succeeds
  but the row insert fails, you have orphan storage. Order: row
  first (gets ID), then upload to `projects/<id>/images/<id>`.
- **Leaking storage on delete.** `delete_project` RPC cascades the
  rows but does NOT delete storage objects — that's a follow-up
  job. Don't assume "project deleted" means "storage cleaned".
- **Signed URLs without TTL bound.** Always source TTL from
  `lib/storage/signed-url-ttl.ts` so dev/prod agree.

## Cross-references

- [docs/domains/auth-rls.md](auth-rls.md) — `storage.objects` RLS
  policies (DO-block) with the regex anchor.
- [docs/domains/image-state.md](image-state.md) — how
  `project_image_state` binds master images.
- [docs/domains/project-lifecycle.md](project-lifecycle.md) —
  cascade behavior on project delete.
- [docs/persistence.md](../persistence.md) — image-state API spec
  with field-level invariants.
- Code: [lib/storage/buckets.ts](../../lib/storage/buckets.ts:20),
  [services/editor/server/crop-image.ts:142](../../services/editor/server/crop-image.ts).
