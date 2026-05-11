# Playbook: Squash Migrations

End-to-end recipe for `supabase migration squash --linked`. Captures
the gotchas hit during the May 2026 squash (PRs #30 + #32). Run this
**after every larger feature block lands** (Trace+Filter cutover,
schema-shape change, drift fix), or whenever there are more than
~5 individual migrations sitting on top of the previous baseline.

The earlier guidance in this doc said ~20, which was overly
conservative — that number was set just after a fresh squash. In
practice the chain gets hard to reason about much sooner. Cheap to
run, cheap to review; do it often.

## Pre-flight

1. **Migration freeze.** No open PR may touch `supabase/migrations/`:
   ```bash
   gh pr list --search "files:supabase/migrations is:open"
   git diff origin/main origin/feat/undo-foundation -- supabase/migrations/
   ```

2. **Env vars in your shell.** From Supabase Dashboard → Settings →
   Database, get the DB password and Session Pooler URL:
   ```bash
   export SUPABASE_DB_PASSWORD='...'
   export SUPABASE_DB_URL="postgresql://postgres.<ref>:${SUPABASE_DB_PASSWORD}@aws-1-eu-north-1.pooler.supabase.com:5432/postgres"
   ```

3. **Backup the remote tracking table** (rollback safety):
   ```bash
   BACKUP_FILE="/tmp/schema_migrations_backup_$(date +%s).csv"
   psql "$SUPABASE_DB_URL" -c "\copy supabase_migrations.schema_migrations TO '$BACKUP_FILE' CSV HEADER"
   ```

## The squash itself

```bash
git checkout -b chore/db-squash-migrations
supabase migration squash --linked --password "$SUPABASE_DB_PASSWORD" --yes
```

Effects:
- Local: every migration except the latest gets deleted; the
  latest-timestamp file is rewritten with the full schema dump.
- Remote: `supabase_migrations.schema_migrations` is rewritten to
  contain only the new baseline entry. (You can re-verify with
  `psql "$SUPABASE_DB_URL" -c "select count(*) from supabase_migrations.schema_migrations;"` — should be 1.)

## Mandatory follow-up: re-append storage policies

The squash dump only includes `public`. The `storage.objects` RLS
policies (DO-block with `insufficient_privilege` exception handler)
were in a deleted migration; copy them back into the new baseline:

```bash
# Find the storage migration that was just deleted
git log --all --diff-filter=D --name-only -- supabase/migrations/ | grep storage
# Append it to the new baseline
git show HEAD:supabase/migrations/<deleted_storage_migration>.sql \
  >> supabase/migrations/<new_baseline>.sql
```

Verify:
```bash
grep -c 'storage\.objects' supabase/migrations/<new_baseline>.sql
# expect ≥ 1
```

## Verification

```bash
supabase db reset --local           # fresh DB applies only the new baseline
npm run check:db-schema             # structural anchors still match
npm run gate:ci                     # all green incl. squash heuristic
```

`scripts/check-types-with-migrations.mjs` has a built-in squash
heuristic (many deletions + at most one modification + zero
additions = treat as squash, types regen not required). It will
say `OK: N deleted + 1 modified migration(s) — looks like a squash`.

## Schema + types regen — one PR or two

The squash typically means `db/schema.sql` and
`lib/supabase/database.types.ts` could be regenerated. Two
strategies:

- **One PR** — include the regen in the squash PR. Faster, large
  diff.
- **Two PRs** (used for #30 + #32) — PR-A is the squash + storage
  re-append; merging triggers `deploy.yml` which is a no-op on prod
  (tracking already aligned by `--linked`). PR-B regenerates
  `db/schema.sql` + types via `--linked`. Cleaner separation.

The two-PR strategy is preferred when prod-vs-intent drift is
suspected — see "Drift discovery" below.

## Filename note

The squash output goes to whichever migration file had the *latest*
timestamp before the squash (e.g.
`20260507130000_align_image_state_to_prod.sql` becomes the new
full-schema file). The filename is then misleading but **don't
rename** — git `--follow` would lose history; future re-squashes
just land on the newest filename anyway.

## Drift discovery (optional but valuable)

After the squash, comparing types from `--local` vs `--linked`
often reveals that prod has manual Studio edits no migration
captures (NOT-NULL columns, extra RPC overloads, columns missing
from intent). The May 2026 squash surfaced four such drifts; we
fixed them in PR #31 with the `@intent-backfill-migration` marker
pattern (see [scripts/check-types-with-migrations.mjs](../../scripts/check-types-with-migrations.mjs)
for how the marker disables the types-required gate).

## Rollback

If the squash CLI fails or the new baseline doesn't apply on a
fresh DB:

```bash
# Restore remote tracking table
psql "$SUPABASE_DB_URL" \
  -c "TRUNCATE supabase_migrations.schema_migrations;
      \copy supabase_migrations.schema_migrations FROM '$BACKUP_FILE' CSV HEADER"

# Throw away the local branch
git checkout main
git branch -D chore/db-squash-migrations
```

## Cross-references

- [domains/database.md](../domains/database.md) — DB-domain overview
- [reference/migrations.md](../reference/migrations.md) — canonical
  CLI workflow + day-to-day commands
- PR #30 (initial squash) and #32 (re-squash post drift fix) for
  the historical commits.
