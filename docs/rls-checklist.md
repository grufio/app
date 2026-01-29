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

