## Database migrations (Supabase)

Canonical DB source of truth is `supabase/migrations/*.sql`.

`db/schema.sql` is a **derived, runnable snapshot** for auditability and SQL-editor fallback.
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

### SQL editor workflow (fallback)

Use this only if you cannot use the Supabase CLI flow.

### Apply a new migration

1. Open the Supabase SQL editor for your project.
2. Copy/paste the required statements from `db/schema.sql` (derived snapshot from canonical migrations).
3. (Optional) Use `db/_archive/` only for historical reference.
4. Execute it as a privileged role (usually `postgres` / `supabase_admin`).
5. Verify the new columns/tables exist and RLS constraints still behave as expected.

### Verify schema drift in the repo

- Local/CI check:

```bash
npm run check:db-schema
```

This ensures `db/schema.sql` keeps intact migration markers and required canonical invariants for audit parity.

### Recommended contract pipeline

Use this sequence for every schema change:

1. Add migration under `supabase/migrations/`.
2. Apply migration to linked DB (`npm run db:push`).
3. Regenerate DB types (`npm run types:gen`).
4. Run drift gates:
   - `npm run check:db-contract`
   - `npm run verify:remote-migrations`

### Recommended: record applied migrations

Because Supabase does not automatically track custom SQL files applied via the SQL editor, production issues often come from “migration was committed but never applied”.

This repo includes an optional migration table (`public.schema_migrations`) to track applied migrations:

- Each migration should be recorded once (filename + checksum).
- You can query the table to confirm your environment is up to date.

### Rollback guidance (MVP-safe)

Prefer **forward-only** migrations for MVP. If you must rollback:
- Add a new migration that reverses the change where possible (e.g. drop columns/constraints).
- Avoid destructive drops when data loss would occur; instead mark deprecated fields and remove later.

