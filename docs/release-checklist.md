## Release checklist (MVP)

### 1) Database migrations

- Canonical migrations (recommended): `supabase/migrations/*.sql` (Supabase CLI-first)
  - Run the remote gate (requires linked project):

```bash
npm run verify:remote-migrations
npm run verify:remote-rls
```

  - If it fails because migrations are missing, apply them:

```bash
supabase db push --linked
```

- Legacy fallback: `db/0xx_*.sql` (SQL editor)
  - Apply each new migration in Supabase SQL editor (see `docs/migrations.md`)
  - If using `public.schema_migrations`, insert a row per applied migration (filename + checksum)

### 2) Local verification

Run:

```bash
npm run test:e2e:install
npm run check
npm run test:e2e
```

Notes:
- Playwright browsers are installed into the repo-local cache (`.playwright-browsers/`) to avoid cross-arch cache issues on macOS.

### 3) Manual QA (editor)

Use:
- `docs/qa/editor-regression-checklist.md`

Minimum:
- Open an existing project
- Upload master image
- Resize image, rotate, drag; reload; confirm persisted state is correct
- Change artboard unit + DPI; confirm no size drift
- Toggle page background; reload; confirm persisted

### 4) Production sanity checks

- Pre-release gate (recommended):
  - Run the GitHub Actions workflow **“Pre-release gates”** (manual trigger) to enforce remote checks.
- Auth:
  - Unauthed: `/dashboard` redirects to `/login`
  - Authed: `/login` redirects to `/dashboard`
- Storage:
  - Upload/download/delete master image works (owner-only)
- RLS:
  - Non-owner cannot access project rows or images (see `docs/rls-checklist.md`)

