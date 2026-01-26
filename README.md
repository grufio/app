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
  - `db/006_storage_project_images_policies.sql`

## Editor architecture (high level)

- **UI module**: `components/shared/editor/`
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

- `npm run dev`: local dev server
- `npm run dev:e2e`: local dev server with `NEXT_PUBLIC_E2E_TEST=1` for Playwright smoke runs
- `npm run build`: production build
- `npm run lint`: eslint
- `npm run test`: unit tests (Vitest)
- `npm run check:db-schema`: validate `db/schema.sql` contains all migration markers
- `npm run check`: lint + tests + schema marker check

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