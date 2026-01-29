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

