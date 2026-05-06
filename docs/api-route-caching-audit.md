# API Route Caching Audit (S2)

Audit of `export const dynamic = "force-dynamic"` across `app/api/projects/**`.

**Result: 17/17 routes legitimately require `force-dynamic`.**

## Why

Every route under `app/api/projects/**`:
1. Calls `createSupabaseServerClient()` which reads auth cookies via `next/headers`.
2. Calls `requireUser(supabase)` to enforce auth + return user-scoped data.
3. Returns RLS-filtered records that differ per user.

In Next.js App Router, any route handler that reads cookies (directly or
transitively) is implicitly dynamic. `force-dynamic` makes that intent
explicit and locks out future static-cache attempts that would silently
serve another user's data.

## Why `revalidate: 60` is not safe here

`revalidate: 60` produces a single cache entry per URL — but these
routes are scoped to the authenticated user inside the handler body,
not via the URL. Caching `GET /api/projects/abc/images/master/list`
once would return user A's image list to user B for the next 60s.
That is a P0 data-leak class, not a perf optimisation.

## Why `unstable_cache()` is also wrong

Same reason: `unstable_cache` keys by the explicit cache tag, not the
auth principal. Wrapping an RLS-scoped query erases the per-user
boundary.

## Conclusion

The original review (`docs/app-review.md` S2, "Listings-Routes per
`revalidate`") was incorrect for this codebase. None of the 17 routes
are listings without per-user scope. **No change required.**

## Where caching IS safe

If a future endpoint returns truly public data (e.g. a healthz/version
route), it can drop `force-dynamic` and use static rendering. None of
the existing 17 fit that profile.

| Route | Auth-scoped? | force-dynamic correct? |
|---|---|---|
| `/api/projects/[projectId]` | yes | yes |
| `/api/projects/create` | yes | yes |
| `/api/projects/[projectId]/filters/{numerate,lineart,pixelate}` | yes | yes |
| `/api/projects/[projectId]/images/filters` | yes | yes |
| `/api/projects/[projectId]/images/filters/[filterId]` | yes | yes |
| `/api/projects/[projectId]/images/filter-working-copy` | yes | yes |
| `/api/projects/[projectId]/images/crop` | yes | yes |
| `/api/projects/[projectId]/images/master` | yes | yes |
| `/api/projects/[projectId]/images/master/[imageId]` | yes | yes |
| `/api/projects/[projectId]/images/master/[imageId]/lock` | yes | yes |
| `/api/projects/[projectId]/images/master/exists` | yes | yes |
| `/api/projects/[projectId]/images/master/list` | yes | yes |
| `/api/projects/[projectId]/images/master/restore` | yes | yes |
| `/api/projects/[projectId]/images/master/upload` | yes | yes |
| `/api/projects/[projectId]/image-state` | yes | yes |
