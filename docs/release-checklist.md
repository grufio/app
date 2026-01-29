## Release checklist (MVP)

### 1) Database migrations

- Identify new migrations since last release: `db/0xx_*.sql`
- Apply each new migration in Supabase SQL editor (see `docs/migrations.md`)
- If using `public.schema_migrations`, insert a row per applied migration (filename + checksum)

### 2) Local verification

Run:

```bash
npx playwright install
npm run check
npm run test:e2e
```

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

- Auth:
  - Unauthed: `/dashboard` redirects to `/login`
  - Authed: `/login` redirects to `/dashboard`
- Storage:
  - Upload/download/delete master image works (owner-only)
- RLS:
  - Non-owner cannot access project rows or images (see `docs/rls-checklist.md`)

