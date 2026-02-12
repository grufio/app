/**
 * Performance + caching guidance (auth + RLS).
 *
 * Responsibilities:
 * - Document safe caching strategies for cookie-auth + RLS apps.
 * - Prevent accidental cross-user caching of signed URLs and user-scoped data.
 */

## Rules of thumb

- **If a page depends on cookies/session, default to dynamic**.
  - In this repo, `app/dashboard/page.tsx` and `app/projects/[projectId]/page.tsx` depend on user auth (Supabase SSR cookies).
  - That’s why they use `dynamic = "force-dynamic"` and do not use ISR.

- **Signed URLs are bearer tokens**.
  - Treat `createSignedUrl(s)` outputs as secrets scoped to the requesting user.
  - Do **not** share signed URL caches across users.

## What is safe

- **Per-request memoization** (recommended):
  - Use server-only helpers and memoize within a request (e.g. `React.cache`) if needed.
  - Safe because it cannot cross user boundaries.

- **Short per-user caches** (optional, if you measure benefit):
  - If you need caching across requests, you must key by `user.id` (or equivalent) so one user’s cached data is never served to another.
  - Keep TTL short for signed URLs.

## What is unsafe

- **ISR / `revalidate` for user-scoped data** without a user-specific cache key:
  - This can serve one user’s data to another.
  - Avoid `fetch(..., { next: { revalidate } })` for anything behind auth unless you fully control the cache keying.

## When to use `revalidate`

- Use `fetch(..., { next: { revalidate: N } })` only for:
  - truly public data, or
  - data that is not user-specific and does not depend on cookies/auth.

