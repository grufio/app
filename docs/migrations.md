## Database migrations (Supabase)

Canonical migration history is `supabase/migrations/`.
`db/schema.sql` is the derived runnable snapshot for auditability and SQL-editor fallback.
Historical numbered SQL files are archived in `db/_archive/`.

### CLI-first workflow (recommended)

This repo supports a Supabase CLI-first workflow using:

- `supabase/config.toml`
- `supabase/migrations/` (canonical going forward)

#### One-time setup

1. Login:

```bash
supabase login
```

2. Link this repo to the hosted Supabase project:

```bash
supabase link --project-ref "<your-project-ref>" --password "$SUPABASE_DB_PASSWORD"
```

#### Day-to-day

- Pending migrations are applied to prod **automatically** by the `Deploy` workflow
  on push to `main` — see [Auto-deploy pipeline](#auto-deploy-pipeline) below. The
  `npm run db:push` command remains available for emergency / out-of-band use only.

- Pull hosted schema changes into a new migration file (remote-aligned snapshot):

```bash
npm run db:pull
```

- Regenerate typed `Database` definitions (used by app queries):

```bash
npm run types:gen
```

### Auto-deploy pipeline

`.github/workflows/deploy.yml` is the single source of truth for prod deploys. On
every push to `main`:

1. A **detect** job inspects the diff. If any file under `supabase/migrations/`
   changed, the **migrations** path runs; otherwise **frontend-only** runs.
2. **migrations** path:
   - Gated by the `production-db` GitHub Environment (required reviewer).
   - Runs `verify:schema-drift` to confirm `db/schema.sql` still matches current
     prod schema *before* pushing — catches a hand-edited prod schema.
   - Applies pending migrations via `supabase db push --linked`.
   - Confirms via `verify:remote-migrations` and `verify:types-synced` that the
     post-push state is consistent.
   - Triggers the Vercel production deploy hook only on success.
3. **frontend-only** path:
   - No migration changes — triggers the Vercel deploy hook immediately.

`workflow_dispatch` always runs the migrations path, so an operator can re-deploy
after a transient failure without a no-op commit.

#### One-time setup (already wired)

- Repo secrets: `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`,
  `VERCEL_DEPLOY_HOOK_URL`. Optional: `SLACK_ALERT_WEBHOOK_URL`.
- GitHub Environment `production-db` with required reviewers.
- Vercel auto-deploy on `main` disabled via "Ignored Build Step: `exit 0`";
  prod deploys only run via the deploy hook above.

### SQL editor workflow (fallback)

Use this only if you cannot use the Supabase CLI flow.

### Apply a new migration

1. Open the Supabase SQL editor for your project.
2. Copy/paste the required statements from `db/schema.sql`.
3. (Optional) Use `db/_archive/` only for historical reference.
4. Execute it as a privileged role (usually `postgres` / `supabase_admin`).
5. Verify the new columns/tables exist and RLS constraints still behave as expected.

### Verify schema drift in the repo

- Local/CI check:

```bash
npm run check:db-schema
```

This ensures `db/schema.sql` has intact migration block markers (`BEGIN`/`END`) as a single-source integrity check.

### Recommended: record applied migrations

Because Supabase does not automatically track custom SQL files applied via the SQL editor, production issues often come from “migration was committed but never applied”.

This repo includes an optional migration table (`public.schema_migrations`) to track applied migrations:

- Each migration should be recorded once (filename + checksum).
- You can query the table to confirm your environment is up to date.

### Rollback guidance (MVP-safe)

Prefer **forward-only** migrations for MVP. If you must rollback:
- Add a new migration that reverses the change where possible (e.g. drop columns/constraints).
- Avoid destructive drops when data loss would occur; instead mark deprecated fields and remove later.

