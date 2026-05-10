# Filter Pipeline

## Purpose

The filter pipeline turns the active master image into a chain of
processed variants (pixelate, lineart, numerate). Frontend forms
collect parameters → API appends to `project_image_filters` → the
Python filter-service does the actual pixel work and produces a new
`filter_working_copy` image. Stack order is preserved so the chain
is deterministic on re-render.

## Where it lives

- [features/editor/components/filter-forms/](../../features/editor/components/filter-forms/)
  — generic FilterForm + per-filter forms (pixelate, lineart, numerate).
- [lib/editor/filters/](../../lib/editor/filters/) — filter registry
  + parameter types. Forms read 100% from registry post-#42.
- [services/editor/server/filter-variants.ts](../../services/editor/server/filter-variants.ts)
  — server-side stack management, dispatches to filter-service.
- [services/editor/server/filter-working-copy.ts](../../services/editor/server/filter-working-copy.ts)
  — manages the `filter_working_copy` image rows.
- [filter-service/](../../filter-service/) — Python FastAPI that
  executes filters (vectorised pixelate, etc).
- API routes: `app/api/projects/[id]/filters/{lineart,pixelate,numerate}/route.ts`
  + `app/api/projects/[id]/images/filters/route.ts`.

## Quick orientation

The active findings doc + roadmap is the canonical reference; this
wrapper exists to give an LLM the entry-point.

## Cross-references

- **Active findings + roadmap (canonical):**
  [docs/reference/filter-stack-findings.md](../reference/filter-stack-findings.md)
- **Python service API:**
  [docs/reference/filter-service.md](../reference/filter-service.md)
- **Related domain docs:**
  [domains/image-editor.md](image-editor.md),
  [domains/image-state.md](image-state.md),
  [domains/storage.md](storage.md)
