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
  - Artboard panel (unit/DPI/size → persists to `project_workspace`)
  - Image panel (size always shown in artboard unit + DPI, commits scaling in px)

### Interaction model

- **Wheel**: pan
- **Ctrl/Cmd + Wheel**: zoom around cursor
- **Hand tool**: drag to pan
- **Pointer tool**: drag image

## Scripts

- `npm run dev`: local dev server
- `npm run build`: production build
- `npm run lint`: eslint
