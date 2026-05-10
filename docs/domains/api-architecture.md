# API Architecture

## Purpose

The 18 API routes under `app/api/` are thin controllers that hand
work off to `services/*`. They share a uniform shape — auth check,
JSON parse, service call, normalised error response — so that adding
a new endpoint is a copy-and-substitute job, not a fresh design.

## Where it lives

- [app/api/](../../app/api/) — Next.js App Router route handlers
  (one `route.ts` per endpoint). Examples:
  - [app/api/projects/create/route.ts](../../app/api/projects/create/route.ts)
    — POST: validate + create project
  - [app/api/projects/[projectId]/route.ts](../../app/api/projects/%5BprojectId%5D/route.ts)
    — GET/DELETE single project
  - [app/api/projects/[projectId]/filters/{lineart,pixelate,numerate}/route.ts](../../app/api/projects/%5BprojectId%5D/filters/)
    — append filter to chain
  - [app/api/errors/ingest/route.ts](../../app/api/errors/ingest/route.ts)
    — frontend-error reporter (POST)
- [lib/api/route-guards.ts](../../lib/api/route-guards.ts) — the
  shared toolkit: `jsonError`, `requireUser`, `readJson`, `isUuid`.
- [lib/supabase/server.ts](../../lib/supabase/server.ts) —
  `createSupabaseServerClient()` factory used by every authenticated
  route.
- [services/](../../services/) — where the business logic actually
  lives. Routes don't query Supabase directly except for auth.

## Key concepts

- **Routes are thin.** A handler is ~30 lines: get supabase client →
  `requireUser()` → `readJson()` → call a service → return
  `NextResponse.json({...})` or `jsonError(...)`. Anything more
  complex lives in `services/<area>/server/`.
- **Standard error envelope.** Every error response goes through
  `jsonError(message, status, { stage, ...extra })`. The shape is
  `{ error, stage, ...extra }` for the client; `stage` is a stable
  machine-readable label like `"validation"`, `"auth"`,
  `"rls_denied"`, `"active_switch"`.
- **Production message scrubbing.** `jsonError` replaces internal
  DB/storage errors with `"Request failed"` in prod unless the
  stage is on an allow-list (`auth`, `validation`, `rls_denied`)
  or the status is 401/403/404. Prevents leaking schema details
  via error messages.
- **`dynamic = "force-dynamic"`** is set on auth-dependent routes
  to opt out of Next.js's static caching for cookie-touching
  handlers.
- **Auth contract.** `requireUser(supabase)` returns either
  `{ ok: true, user }` or `{ ok: false, res }` — caller does
  `if (!u.ok) return u.res` and continues with `u.user.id`. RLS
  on the Supabase queries is the actual access control; the auth
  check just gives you the `user.id`.
- **JSON-body cap.** `readJson` enforces 256 KB by default. Larger
  payloads (image uploads) use `formData()` directly, not JSON.

## Standard route shape

```ts
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient()

  const u = await requireUser(supabase)
  if (!u.ok) return u.res

  const parsed = await readJson<MyBody>(req, { stage: "validation" })
  if (!parsed.ok) return parsed.res

  // call into services/, never query Supabase directly here
  const res = await doSomething(supabase, { ownerId: u.user.id, ...parsed.value })
  if (!res.ok) return jsonError(res.message, 400, { stage: res.stage })

  return NextResponse.json({ ok: true, ...res.payload })
}
```

## Conventions

- **No business logic in route handlers.** If you find yourself
  writing a `for` loop or a `supabase.from(...).select(...)`,
  extract a function in `services/<area>/server/`.
- **Use `jsonError`, not `NextResponse.json({error}, {status})`
  directly.** The wrapper does the prod-scrubbing + stage labelling
  consistently.
- **Path params via the `[bracket]` segment** are validated with
  `isUuid()` before any DB call. A bad path is a 400, not a 500.
- **POST = create or trigger; PATCH = update field; DELETE = remove
  or soft-delete; GET = read.** Routes that conflate multiple verbs
  (e.g. POST that sometimes deletes) are a smell.
- **Service-role client is rare and audited** — only
  `services/editor/server/filter-variants.ts:192` and a few env
  helpers use it. New uses must be added to the
  `verify:service-role-usage` allowlist (see
  [docs/conventions.md](../conventions.md) hooks/CODEOWNERS).

## Common pitfalls

- **Returning `NextResponse.json({ error })` with a raw DB error.**
  Leaks schema. Always go through `jsonError`.
- **Forgetting `dynamic = "force-dynamic"` on a cookie-reading
  route.** Next.js may try to statically cache it; auth then breaks
  in prod.
- **Calling Supabase RPCs directly from a React component**, instead
  of going through `services/<area>/client/`. Bypasses the typed
  wrapper layer and makes mocks impossible.
- **Wrapping a route in try/catch and logging the error.** The
  `jsonError` flow already produces a structured response and the
  ingest route ([app/api/errors/ingest/route.ts](../../app/api/errors/ingest/route.ts))
  is for frontend errors. Server logs come from the platform.

## Cross-references

- [docs/api-route-caching-audit.md](../api-route-caching-audit.md)
  — per-route audit of `dynamic`, `revalidate`, etc. Settings.
- [docs/domains/auth-rls.md](auth-rls.md) — RLS contract that
  routes rely on.
- [docs/domains/project-lifecycle.md](project-lifecycle.md) — the
  largest cluster of routes (`app/api/projects/...`).
- [docs/monitoring.md](../monitoring.md) — error-ingest pipeline
  driven by `/api/errors/ingest`.
- Code: [lib/api/route-guards.ts](../../lib/api/route-guards.ts:21)
  for `jsonError`'s prod-scrubbing logic.
