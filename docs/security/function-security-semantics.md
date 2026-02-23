# Function Security Semantics Audit

Date: 2026-02-05  
Scope: Editor-critical database functions used by image activation/state workflows.

## Policy

- Default execution model is `SECURITY INVOKER`.
- `SECURITY DEFINER` is only acceptable with explicit rationale and separate approval.
- Privilege model changes must be isolated from behavior refactors.

## Reviewed Functions

| function | current security mode | search_path pinned | assessment |
| --- | --- | --- | --- |
| `public.set_active_image` | invoker | yes (`public, pg_temp`) | acceptable |
| `public.set_active_master_image` | invoker | yes (`public, pg_temp`) | acceptable |
| `public.set_active_master_latest` | invoker | yes (`public, pg_temp`) | acceptable |
| `public.set_active_master_with_state` | invoker | yes (`public, pg_temp`) | acceptable |
| `public.project_workspace_sync_px_cache` | invoker | yes (`public, pg_temp`) | acceptable |

## Findings

- No `SECURITY DEFINER` change is required for current sprint scope.
- No privilege escalation path identified in covered editor-critical functions.
- Existing RLS + invoker model remains the authoritative access boundary.

## Approval Gate

- If a future change proposes `SECURITY DEFINER`, it must include:
  - threat model rationale,
  - explicit owner sign-off,
  - isolated migration/review track.
