/**
 * Supabase security runbook (RLS + Storage).
 *
 * Responsibilities:
 * - Document invariants for safe Supabase usage in this repo.
 * - Provide copy/paste SQL snippets to validate RLS and Storage access.
 * - Provide a quick checklist for releases and debugging.
 */

## Invariants (non-negotiable)

- **Never use `service_role` in the frontend**.
  - Frontend uses **only**:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **All data access is enforced by RLS** (Postgres + Storage).
- **Server-side code uses cookie/session-bound auth**:
  - Standard: `lib/supabase/server.ts` (`createSupabaseServerClient()`).
  - Special case (Storage calls needing explicit auth header): `lib/supabase/authed-user.ts` (`createSupabaseAuthedUserClient(accessToken)`).

## Storage path convention

- **Bucket**: `project_images`
- **Object paths**:
  - `projects/{projectId}/master/{filename}`
  - `projects/{projectId}/working/{filename}` (future/optional)

These paths are part of the Storage RLS policies (see `db/006_storage_project_images_policies.sql` and `db/015_rls_policy_optimizations.sql`).

## Where policies live

- **Database tables (public schema)**: `db/001_init.sql`, `db/005_project_images_rls_policies.sql`, `db/007_project_image_state.sql`, `db/015_rls_policy_optimizations.sql`
- **Storage policies**: `db/006_storage_project_images_policies.sql` (and optimized variants in `db/015_rls_policy_optimizations.sql`)
- **Canonical snapshot**: `db/schema.sql` (CI verifies markers + policy checks)

## Automated verification (CI + local)

- Run locally:

```bash
npm run verify:rls
```

- Included in:
  - `npm run check`
  - CI workflow step “Check (lint + tests + schema markers)”

What it validates:
- Critical tables have `ENABLE ROW LEVEL SECURITY`.
- Critical tables have owner-only policies (FOR ALL or CRUD coverage, with `auth.uid()`).
- `storage.objects` has RLS enabled and policies restrict to bucket `project_images`.
- No runtime code reads `process.env.SUPABASE_SERVICE_ROLE_KEY` (or similar).

## Manual SQL: validate access as owner vs non-owner

Run these in Supabase SQL editor.

### 1) Verify RLS enabled for critical tables

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'projects',
    'project_images',
    'project_workspace',
    'project_grid',
    'project_image_state',
    'project_vectorization_settings',
    'project_pdfs',
    'project_filter_settings',
    'project_generation'
  )
order by tablename;
```

### 2) Inspect policies for a table

```sql
select polname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'project_workspace'
order by polname;
```

### 3) Inspect Storage policies

```sql
select polname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by polname;
```

## Debugging checklist (common failure modes)

- **401 Unauthorized**:
  - Server route: session missing (cookies not present / not forwarded).
  - Client: user not logged in.
- **403 Forbidden**:
  - RLS denies access (most common).
  - Confirm `auth.uid()` matches the project owner and policies exist.
- **Storage upload/download fails**:
  - Path does not match `projects/{projectId}/{role}/...`.
  - Bucket mismatch (must be `project_images`).
  - Storage RLS policy not applied (requires SQL editor run as `postgres`/`supabase_admin` depending on ownership).

