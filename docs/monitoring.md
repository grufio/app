## Monitoring / Error reporting (optional)

This repo currently logs errors to the console in route error boundaries:

- `app/error.tsx`
- `app/projects/[projectId]/error.tsx`

### Recommendation (production)

Add an error reporting service (e.g. Sentry) to capture:

- unhandled route errors (App Router `error.tsx`)
- client-side editor errors (Konva interaction edge-cases)
- API route errors (server-side)

When adding a provider, keep it optional and configured via env vars so local dev stays lightweight.

### Minimal MVP option: HTTP ingest endpoint

If you want something lighter than a full vendor SDK, you can configure an HTTP endpoint to receive error events:

- `NEXT_PUBLIC_ERROR_INGEST_URL`: when set, the app can POST JSON error events to this URL.

This can be a small serverless function, an internal webhook, or a third-party ingest endpoint.

### In-app option (zero extra deploys)

The repo ships with a built-in ingest route at [app/api/errors/ingest/route.ts](../app/api/errors/ingest/route.ts):

- Receives POSTs of the structured `ErrorEvent` shape from `lib/monitoring/error-reporting.ts`.
- `console.error`s the payload — Vercel function logs / GCP Logging captures it without an SDK.
- Per-IP rate limit (60 events/minute) so a malicious client can't flood logs.
- Sanitises + caps field lengths before logging.

To enable, set `NEXT_PUBLIC_ERROR_INGEST_URL=/api/errors/ingest` in Vercel env vars (Production + Preview). The relative URL works because the reporter runs in the browser.

To upgrade later (forward to Sentry / Better Stack / Supabase table), edit the route's `console.error` call site.

### Supabase Edge Function option (CLI-first alternative)

This repo also includes a Supabase Edge Function scaffold:

- Function: `supabase/functions/error-ingest`
- Deploy:

```bash
supabase functions deploy error-ingest --project-ref rfaykmiydsvdhrqngjue
```

- Then set:
  - `NEXT_PUBLIC_ERROR_INGEST_URL` to `https://rfaykmiydsvdhrqngjue.functions.supabase.co/error-ingest`

Notes:
- For MVP we simply log events in the function. You can later extend to store in a table or forward to a provider.

