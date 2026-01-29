## Database migrations (Supabase)

This repo keeps numbered SQL files in `db/` as the canonical migrations, and embeds them into `db/schema.sql` for convenience.

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

