## Database migrations (Supabase)

Legacy migrations live in `db/` and are embedded into `db/schema.sql` for convenience.

Going forward, **canonical migrations** are in `supabase/migrations/` and should be applied via Supabase CLI.

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

- Apply pending migrations to hosted DB:

```bash
npm run db:push
```

- Pull hosted schema changes into a new migration file (remote-aligned snapshot):

```bash
npm run db:pull
```

- Regenerate typed `Database` definitions (used by app queries):

```bash
npm run types:gen
```

### Legacy SQL editor workflow (fallback)

Use this only if you cannot use the Supabase CLI flow.

### Apply a new migration

1. Open the Supabase SQL editor for your project.
2. Copy/paste the contents of the new migration file (e.g. `db/016_project_workspace_page_bg.sql`).
3. Execute it as a privileged role (usually `postgres` / `supabase_admin`).
4. Verify the new columns/tables exist and RLS constraints still behave as expected.

### Verify schema drift in the repo

- Local/CI check:

```bash
npm run check:db-schema
```

This ensures **every** `db/0xx_*.sql` file has a matching `BEGIN/END` marker block embedded into `db/schema.sql`.

### Recommended: record applied migrations

Because Supabase does not automatically track custom SQL files applied via the SQL editor, production issues often come from “migration was committed but never applied”.

This repo includes an optional migration table (`public.schema_migrations`) to track applied migrations:

- Each migration should be recorded once (filename + checksum).
- You can query the table to confirm your environment is up to date.

### Rollback guidance (MVP-safe)

Prefer **forward-only** migrations for MVP. If you must rollback:
- Add a new migration that reverses the change where possible (e.g. drop columns/constraints).
- Avoid destructive drops when data loss would occur; instead mark deprecated fields and remove later.

