# Database

## Purpose

Supabase Postgres 17. Single squashed baseline migration is the
source of truth for schema; future migrations stack on top.
[db/schema.sql](../../db/schema.sql) is a derived snapshot of prod
state for static analysis. Schema-drift gates compare the snapshot
against fresh prod dumps so manual Studio edits get caught.

## Where it lives

- [supabase/migrations/](../../supabase/migrations/) — canonical
  migration history. Currently one squashed baseline file post-PR-#32;
  new migrations land on top.
- [db/schema.sql](../../db/schema.sql) — `pg_dump`-style mirror of
  prod, regenerated via `npm run db:dump`.
- [db/_archive/](../../db/_archive/) — historical pre-CLI migrations.
  Pure reference, nothing reads from here at runtime.
- [supabase/config.toml](../../supabase/config.toml) — local
  Supabase config; Postgres major version pinned to **17** to match
  prod.
- [lib/supabase/database.types.ts](../../lib/supabase/database.types.ts)
  — TypeScript types regenerated from prod via `npm run types:gen`.
- [scripts/verify-schema-drift.mjs](../../scripts/verify-schema-drift.mjs),
  [scripts/verify-remote-migrations.mjs](../../scripts/verify-remote-migrations.mjs),
  [scripts/check-db-schema.mjs](../../scripts/check-db-schema.mjs)
  — gates that verify schema integrity.

## Key facts

- **Auto-deploy on `main`:** `supabase db push --linked` runs in
  [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)
  with `production-db` Environment approval gate. No more manual
  `db push`.
- **Squash workflow:** `supabase migration squash --linked` is the
  blessed way to consolidate the migration tree. Storage policies
  must be re-appended manually (squash drops the `storage` schema).
  Full recipe in [docs/playbooks/squash-migrations.md](../playbooks/squash-migrations.md).
- **`@intent-backfill-migration` marker:** migrations that capture
  prod-state-already-there (no new schema delta) carry this marker
  in their first 50 lines so [scripts/check-types-with-migrations.mjs](../../scripts/check-types-with-migrations.mjs)
  doesn't falsely require a types regen.
- **Drift handling:** if `verify:schema-drift` fails, prod has been
  hand-edited via Studio — close it with a backfill migration, not
  by editing prod.

## Cross-references

- **Migrations workflow (canonical):**
  [docs/reference/migrations.md](../reference/migrations.md)
- **DB review + audit findings:**
  [docs/reference/db-review.md](../reference/db-review.md)
- **Auth/RLS layer over the schema:**
  [domains/auth-rls.md](auth-rls.md)
- **Project create/delete + RPCs:**
  [domains/project-lifecycle.md](project-lifecycle.md)
- **Image state binding details:**
  [domains/image-state.md](image-state.md)
