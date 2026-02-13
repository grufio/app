## Release checklist (MVP)

### 1) MVP release gate (local-only)

```bash
npm ci
npm run check
```

Optional smoke (recommended before demos/releases):

```bash
npm run test:e2e:install
npm run test:e2e
```

Notes:
- `npm run test:e2e` runs the **single** editor boot smoke (tripwire).
- Playwright browsers are installed into the repo-local cache (`.playwright-browsers/`) to avoid cross-arch cache issues on macOS.

### 2) Optional: remote verification (use when needed)

If you suspect “works locally, fails in Supabase” (migration/policy drift), use the CLI-first workflow in `docs/migrations.md`:

```bash
npm run verify:remote-migrations
npm run verify:remote-rls
SUPABASE_DB_URL="postgresql://..." npm run verify:image-state-binding
```

`verify:image-state-binding` is the rollout gate for master image/state consistency. It fails if any of these conditions are detected:
- more than one active master image in a project
- active master image without matching `project_image_state.image_id`
- stale state binding (`image_id` null or mismatched vs active master)
- state row referencing a missing image id

If migrations are missing:

```bash
supabase db push --linked
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

