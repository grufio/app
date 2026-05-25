# Filter Pipeline

## Purpose

The filter pipeline turns the active master image into a chain of
processed variants. Two distinct output families:

- **Raster filters** (pixelate, crop) — produce new
  `filter_working_copy` rows inside the chain. Stack order is
  preserved in `project_image_filters` so the chain is deterministic
  on re-render.
- **Trace outputs** (pixelate, circulate, lineart) — produce SVG sinks
  with `kind='trace_output'` (PR #119) referenced by
  `project_image_trace.output_image_id`. These sit outside the
  filter chain; the trace is mutually exclusive (one per project).
  Registered in `lib/editor/trace/registry.ts`; pixelate + circulate use
  bespoke dialogs with a live palette preview, lineart the generic form.

Frontend forms collect parameters → API appends to
`project_image_filters` (raster) or upserts `project_image_trace`
(trace) → the Python filter-service does the actual pixel/vector
work.

## Where it lives

- [features/editor/components/filter-forms/](../../features/editor/components/filter-forms/)
  — generic FilterForm + per-filter forms (pixelate, lineart, numerate).
- [lib/editor/filters/](../../lib/editor/filters/) — filter registry
  + parameter types. Forms read 100% from registry post-#42.
- [services/editor/server/filter-variants.ts](../../services/editor/server/filter-variants.ts)
  — server-side stack management, dispatches to filter-service.
- [services/editor/server/filter-working-copy.ts](../../services/editor/server/filter-working-copy.ts)
  — manages the `filter_working_copy` image rows.
- [services/editor/server/working-copy/ensure.ts](../../services/editor/server/working-copy/ensure.ts)
  — lazy `working_copy` creation. Master upload no longer
  auto-creates a working_copy; the filter-apply path calls
  `ensureWorkingCopyExists()` first, which server-side copies
  from the master via `storage.copy()`.
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
