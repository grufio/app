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
- **`deploy.yml` VERIFIES `database.types.ts`, it does NOT
  auto-regenerate.** The migrations job runs `verify:types-synced`, which
  **hard-fails the deploy** (blocking the Vercel trigger) when committed
  [lib/supabase/database.types.ts](../../lib/supabase/database.types.ts)
  diverges from the remote dump in BOTH directions; it **soft-skips** a
  strict subset (pure-additive remote drift) or superset. So a migration PR
  must keep the file in sync via `npm run types:gen` (linked) — and a
  column/table **DROP** must also delete those lines from the committed
  types, or they hard-fail the next migration deploy (#482, dropped
  `is_hidden`). Don't hand-edit to ADD types; cast at the call site
  (`as any` / `as Database["public"]["Tables"]["…"]`). CLAUDE.md mirrors this.

## Reserved-but-unused schema slots

The following objects look dead to a code-grep audit but are
intentional placeholders or limited-scope helpers. Don't drop them
without checking the rationale below.

### `*_variants` tables (reserved)

Five tables hold paint-variant metadata (size, weight, stock, price)
and are not yet read by any app code path:

- `public.color_acryl_schmincke_primacryl_variants`
- `public.color_oil_schmincke_norma_variants`
- `public.lab_custom_variants`
- `public.lab_grays_variants`
- `public.lab_munsell_variants`

These are reserved for the upcoming paint-tube-size feature
(5 ml / 35 ml / 200 ml variants per pigment, plus per-variant SKU /
stock / price). Schema is forward-compatible with that feature; rows
will be backfilled when the consumer code lands. Their RLS policies
stay in place to avoid a delete-then-recreate churn.

If a future audit flags them again: link this section.

### `lab_munsell.hue_pct / hue_family / value / chroma`

Four columns on `lab_munsell` are populated at seed time but read
by exactly one consumer — the `derive_iscc_nbs_name(hue_family,
hue_pct, value, chroma)` SQL function (see migration
`20260602…_derive_iscc_nbs_name.sql`). App code never reads them
directly; ISCC-NBS chip names flow back via `lab_munsell.iscc_nbs_name`
which the function populates.

Don't promote these columns to TypeScript consumers — that's the
function's job, and bypassing it duplicates the Kelly-&-Judd
binning logic in two places.

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
