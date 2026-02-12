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

### Supabase Edge Function option (recommended for CLI-first)

This repo includes a Supabase Edge Function scaffold you can deploy to receive error events:

- Function: `supabase/functions/error-ingest`
- Deploy:

```bash
supabase functions deploy error-ingest --project-ref rfaykmiydsvdhrqngjue
```

- Then set:
  - `NEXT_PUBLIC_ERROR_INGEST_URL` to `https://rfaykmiydsvdhrqngjue.functions.supabase.co/error-ingest`

Notes:
- For MVP we simply log events in the function. You can later extend to store in a table or forward to a provider.

