## gruf.io

Next.js + Supabase app with a lightweight Illustrator-style editor for project images (pan/zoom/artboard + image transform).

## Development

### Prerequisites

- Node.js (recommendation: Node 20+)
- A Supabase project (DB + Storage)

### Setup

- **Install**:

```bash
npm install
```

- **Environment**: copy `env.example` to `.env.local` and fill in:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

- **Run**:

```bash
npm run dev
```

## Supabase Notes

### Storage bucket + path convention

- **Bucket**: `project_images`
- **Object path** (current convention):
  - `projects/{projectId}/master/{filename}`
  - `projects/{projectId}/working/{filename}` (future)

### RLS policies

- Storage access is restricted to the project owner via policies in:
  - `db/schema.sql` (historical source file: `db/_archive/006_storage_project_images_policies.sql`)

## Editor architecture (high level)

- **UI module**: `features/editor/`
  - Header (inline title editing)
  - Tool sidebar (hand/select/zoom/fit/rotate)
  - Konva canvas stage (artboard rect + image node)
  - Artboard panel (unit/size + raster effects preset → persists to `project_workspace`)
  - Image panel (size shown in artboard unit + DPI, commits scaling in px)

### Persistence

- **Artboard**: `project_workspace`
  - `unit`, `width_value`, `height_value`
  - `dpi_x/dpi_y` (numeric DPI)
  - `raster_effects_preset` ("high" | "medium" | "low")
- **Image working state**: `project_image_state`
  - canonical µpx: `width_px_u/height_px_u` (strings; µpx = px·1e6)
  - optional µpx position: `x_px_u/y_px_u`
  - `rotation_deg`
  - unit changes are display-only (no save)

### Interaction model

- **Wheel**: pan
- **Ctrl/Cmd + Wheel**: zoom around cursor
- **Hand tool**: drag to pan
- **Pointer tool**: drag image

## Scripts

Grouped by concern. See [package.json](package.json) for the full list.

### Develop

- `npm run dev` — local dev server (real Supabase).
- `npm run dev:e2e` — dev server with `E2E_TEST=1`; lets `x-e2e-test` /
  `x-e2e-user` headers opt in to mock-mode (see [e2e/_mocks.ts](e2e/_mocks.ts)).
- `npm run build` / `npm run start` — production build / start.

### Test

- `npm run test` / `npm run test:watch` — Vitest unit tests.
- `npm run test:coverage` — same, with v8 coverage report.

### E2E (Playwright)

- `npm run test:e2e` → smoke run.
- `npm run test:e2e:full` → full editor.boot suite.
- `npm run test:e2e:visual` → visual regression on form surfaces.
- `npm run test:e2e:visual:update` → regenerate visual baselines.

### Verify (gate building blocks)

- `npm run lint` / `npm run typecheck`
- `npm run verify:rls` / `npm run verify:remote-rls`
- `npm run verify:service-role-usage` (allowlist enforcement)
- `npm run check:types-with-migrations` (offline schema-drift guard)
- `npm run verify:types-synced` (linked Supabase only)
- `npm run check:db-schema` / `npm run check:bootstrap-migrations`

### DB

- `npm run db:pull` / `npm run db:push` — link to remote.
- `npm run types:gen` — regenerate `lib/supabase/database.types.ts`.

### Deploy

- `npm run vercel:env:push:{development,preview,production}` — sync
  `.env.vercel.<target>` to Vercel.

## Gates

The project ships three gate compositions:

| Gate | Runs | Where |
|---|---|---|
| `gate:local` | lint + typecheck + tests + RLS checks + service-role allowlist | every dev cycle |
| `gate:linked` | gate:local + types-synced (live Supabase) | local with linked project |
| `gate:ci` | gate:local + types-with-migrations + coverage gate | every PR (GitHub Actions) |
| `gate:pre-release` | gate:ci + remote RLS + visual regression | before release |

`npm run check` is an alias for `gate:local`; `npm run check:ci` for `gate:ci`.

## Branching

Conventional prefixes used in this repo (matched against history):

- `feat/`, `bug/`, `fix/`, `refactor/`, `perf/`, `chore/`, `test/`, `docs/`

See [docs/conventions.md](docs/conventions.md) for branch / commit / file naming.

## Database workflow

- Active SQL source of truth: `db/schema.sql`
- Historical numbered migrations (`db/0xx_*.sql`) are archived in
  `db/_archive/` and are not the active source.
- Migrations land under `supabase/migrations/`. The
  `check:types-with-migrations` gate enforces that any migration change
  ships with a regenerated `lib/supabase/database.types.ts`.

## Deployment

- **App** runs on Vercel. Env vars synced via `npm run vercel:env:push:*`.
- **Filter service** (`filter-service/`, FastAPI + OpenCV) runs on
  Cloud Run, scale-to-zero. Auto-deployed via GitHub Actions +
  Workload Identity Federation (`.github/workflows/deploy-filter-service.yml`).
- Service URL is wired through `FILTER_SERVICE_URL`.

## CI

See `docs/ci/README.md`. (We keep workflows as a template to avoid GitHub token `workflow`-scope issues.)

### Optional: local pre-commit hook

If you want a lightweight local guard (no extra dependencies), you can add a git pre-commit hook:

```bash
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
set -e
npm -s run check
EOF
chmod +x .git/hooks/pre-commit
```

## Further reading

- [docs/conventions.md](docs/conventions.md) — file naming, branching, commits, gates.
- [docs/api-route-caching-audit.md](docs/api-route-caching-audit.md) — why `force-dynamic` is correct.
- [docs/app-review.md](docs/app-review.md) — full app review (2026-05-05).
- [docs/forms-optimizations.md](docs/forms-optimizations.md) — forms architecture decisions.