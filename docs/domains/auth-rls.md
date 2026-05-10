# Auth & RLS

## Purpose

gruf.io is single-user per project: every row in the public schema
is owner-gated via `auth.uid() = owner_id` (or transitively through
`projects`). RLS is the access boundary; the auth check in API
routes only gives you `user.id` to write rows with the right owner —
RLS does the actual policing.

## Where it lives

- [lib/auth/](../../lib/auth/) — auth-related client helpers (login
  redirects etc.).
- [lib/supabase/server.ts](../../lib/supabase/server.ts) +
  [lib/supabase/client.ts](../../lib/supabase/client.ts) — Supabase
  client factories that automatically attach the user's session
  cookie. RLS policies see `auth.uid()` correctly.
- DB: `auth.uid()`-based RLS policies in the squashed baseline
  ([supabase/migrations/](../../supabase/migrations/)). Storage
  policies on `storage.objects` live in a `DO`-block at the end of
  the same baseline (insufficient_privilege exception handler).

## Key facts

- `service_role` client bypasses RLS. **Allowlisted** to 4 files via
  [scripts/verify-service-role-usage.mjs](../../scripts/verify-service-role-usage.mjs);
  the gate fails any new use that isn't documented.
- All `public.*` tables protected by an owner-only policy. Schema
  changes that add a table without RLS fail [scripts/verify-rls.mjs](../../scripts/verify-rls.mjs).
- Storage objects: bucket `project_images`, path regex
  `^projects/<uuid>/images/<uuid>` enforced in storage.objects RLS.
- `delete_project` RPC sets `app.deleting_project` GUC to bypass
  `guard_master_immutable` during cascade — see
  [domains/project-lifecycle.md](project-lifecycle.md).

## Cross-references

- **Detailed RLS architecture (canonical):**
  [docs/security/supabase-rls.md](../security/supabase-rls.md)
- **Pre-release verification checklist:**
  [docs/checklists/rls.md](../checklists/rls.md)
- **Lock & guard matrix (master immutable, advisory locks):**
  [docs/security/lock-guard-matrix.md](../security/lock-guard-matrix.md)
- **Function security semantics:**
  [docs/security/function-security-semantics.md](../security/function-security-semantics.md)
- **Related domain docs:**
  [domains/storage.md](storage.md) (bucket RLS),
  [domains/project-lifecycle.md](project-lifecycle.md) (delete cascade)
