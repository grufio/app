/**
 * Runbook: Editor access + Storage (RLS) failures.
 *
 * Goal:
 * - Diagnose “editor can’t load/save” issues quickly and reproducibly.
 * - Distinguish auth/session problems from RLS/policy issues from schema drift.
 *
 * Scope:
 * - No UI changes required.
 * - Works for local dev and hosted Supabase environments.
 */

## Symptoms → likely causes (fast mapping)

### Symptom: “Project page shows 404, but project exists”

- Most common: **RLS denied** (treat as auth/policy, not “missing data”).
- Also possible: client called a route with `projectId=undefined` (invalid UUID) → boundary validation should return 400.

### Symptom: “Upload/download master image fails”

- **Storage policy missing / not applied** on remote (`storage.objects`).
- **Object path mismatch** (must follow `projects/{projectId}/{role}/{filename}`).
- **Bucket mismatch** (must be `project_images`).
- **Auth/session missing** (server route not receiving cookies; client not logged in).

### Symptom: “Editor changes don’t persist / revert on reload”

- RLS denied on `project_image_state`/`project_workspace` updates.
- Schema drift / missing columns on remote.
- A regression in coalescing/commit logic (less likely if APIs show 200 but data doesn’t change).

## First 5 checks (do these in order)

### 1) Local static security gate (repo truth)

```bash
npm run verify:rls
```

If this fails, **fix repo schema/policies first** (don’t debug runtime yet).

### 2) Remote canonical migration gate (hosted DB truth)

```bash
npm run verify:remote-migrations
```

If it fails:

```bash
supabase db push --linked
```

### 3) Remote Storage/RLS gate (hosted policy truth)

```bash
npm run verify:remote-rls
```

If it fails, the hosted project likely missed the Storage policy DDL (common when CLI cannot apply `storage.objects` changes due to ownership).

### 4) Capture the failing request and classify it

In the browser Network tab, open the failing request and note:
- **HTTP status** (401 / 403 / 404 / 400 / 500)
- Response JSON: `{ error, stage }` (if present)

Quick interpretation:
- **400**: input validation (bad UUID, missing body fields)
- **401**: auth/session missing
- **403**: RLS/policy denies (most common)
- **404**: can be “not found” or intentionally returned when RLS denies (treat as auth/policy unless proven otherwise)
- **500**: server error / schema missing / unexpected state

### 5) Dump remote schema for policy inspection (optional but decisive)

```bash
supabase db dump --linked --schema storage --file /tmp/storage.schema.sql
supabase db dump --linked --schema public --file /tmp/public.schema.sql
```

Then inspect `/tmp/storage.schema.sql` for:
- `alter table storage.objects enable row level security;`
- `on storage.objects for select|insert|update|delete`
- `bucket_id = 'project_images'`
- `auth.uid()`

## Fix playbooks

### A) Fix: Storage policies missing on remote (the “owner of table objects” footgun)

**Signal**:
- `npm run verify:remote-rls` fails
- Upload/download requests return 403 (or 404 masking access denial)

**Action**:
- Apply the Storage policies in the **Supabase SQL editor** as a privileged role (`postgres` / `supabase_admin`), using the repo’s canonical SQL:
  - `db/006_storage_project_images_policies.sql`
  - plus any optimizations in `db/015_rls_policy_optimizations.sql` (if you use them)

**Verify**:
- Re-run:

```bash
npm run verify:remote-rls
```

### B) Fix: RLS denied for app tables (projects/workspace/grid/image_state)

**Signal**:
- 403/404 responses on project/workspace/grid/image_state routes
- `npm run verify:rls` passes locally, but remote still denies

**Action**:
- Ensure migrations were applied to hosted DB:

```bash
npm run verify:remote-migrations
supabase db push --linked
```

- In Supabase SQL editor, inspect policies:

```sql
select polname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname, tablename, polname;
```

**Verify**:
- As owner user, `select` works; as non-owner, access is denied (see `docs/rls-checklist.md`).

### C) Fix: Auth/session missing (401)

**Signal**:
- API routes return 401, or Supabase SSR client can’t see user session.

**Action**:
- Confirm login flow works (`/login` → `/dashboard`).
- Confirm server routes are not accidentally cached across users (auth-dependent routes should be dynamic).
- Confirm cookies are present on requests (`sb-*-auth-token.*`).

## References (single source of truth)

- Release gate checklist: `docs/release-checklist.md`
- RLS/Storage checklist: `docs/rls-checklist.md`
- Supabase security invariants + SQL snippets: `docs/security/supabase-rls.md`
- Migration workflow: `docs/migrations.md`

