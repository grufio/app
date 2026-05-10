## RLS / Storage policy checklist (MVP)

This MVP is **owner-only**. Access control relies on:
- Supabase Auth (cookie-based session)
- Postgres Row Level Security (RLS) on tables
- Storage policies on `storage.objects`

### Quick sanity checks (before shipping)

#### DB tables
- Confirm RLS is enabled on owner-protected tables:
  - `public.projects`
  - `public.project_workspace`
  - `public.project_grid`
  - `public.project_images`
  - `public.project_image_state`
- Confirm policies use the same rule:
  - A row is accessible iff the parent `projects.owner_id = auth.uid()`.

#### Storage bucket
- Bucket: `project_images`
- Path convention: `projects/{projectId}/{role}/{filename}`
- Policies must enforce:
  - `bucket_id = 'project_images'`
  - projectId extracted from object path is a UUID
  - the referenced project is owned by `auth.uid()`

### Common failure modes

- **“Works locally, 403 in prod”**: migration/policy not applied to the Supabase project.
- **“404/Not found” but project exists**: RLS is denying access; treat as auth/policy issue, not missing data.
- **“Invalid UUID” errors**: client is calling routes with `projectId=undefined`; validate at API boundary.

### How to debug quickly

- Check the network response JSON for an `error` and `stage` field.
- In Supabase SQL editor, run a simple select as the authenticated user (if using the “Run as” feature) to confirm RLS behavior.
- Verify storage policy by attempting to list/download an object as owner vs non-owner.

### CLI-runnable verification (recommended)

If you have the Supabase CLI linked to the project, prefer a repeatable verification flow:

1. **Confirm link + project**:

```bash
supabase projects list
supabase link --project-ref rfaykmiydsvdhrqngjue --password "$SUPABASE_DB_PASSWORD"
```

2. **Dump public schema for review** (no data):

```bash
supabase db dump --linked --schema public --file /tmp/public.schema.sql
```

3. **Spot-check policies via SQL editor** (fastest) or `psql` using your DB URL:

```sql
-- Sanity: user can see own projects
select id, owner_id, name
from public.projects
order by updated_at desc
limit 5;

-- Child tables should be restricted by parent ownership
select project_id, role, storage_path
from public.project_images
limit 5;

select project_id, role, width_px_u, height_px_u, rotation_deg
from public.project_image_state
limit 5;
```

4. **Storage policy smoke**:
- In the Supabase dashboard Storage UI, try listing/download as owner.
- If you have a second (non-owner) user, confirm access is denied.

