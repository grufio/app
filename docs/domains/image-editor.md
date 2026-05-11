# Image Editor

## Purpose

The editor is where users open a project, see the canvas with the
master image, place / scale / rotate it on the artboard, apply a
filter chain (pixelate / lineart / numerate), and persist the
result. It splits into three layers: pure-math canvas model
(`lib/editor/`), Konva render + XState orchestration
(`features/editor/`), and server-side image operations
(`services/editor/`).

## Where it lives

- [lib/editor/](../../lib/editor/) — pure logic: pan/zoom math
  (`canvas-model.ts`), unit conversions (`units.ts`,
  `fixed-units.ts`), image kind + placement
  (`image-kind.ts`, `image-placement.ts`),
  [machines/image-workflow.machine.ts](../../lib/editor/machines/image-workflow.machine.ts)
  (XState orchestration), [konva/](../../lib/editor/konva/),
  [layers/](../../lib/editor/layers/),
  [imageState/](../../lib/editor/imageState/),
  [filters/](../../lib/editor/filters/) (filter registry).
- [features/editor/](../../features/editor/) — React surface:
  `ProjectEditorStage`, `ProjectEditorRightPanel`, the form
  components for each filter (`pixelate-form.tsx`,
  `lineart-form.tsx`, `numerate-form.tsx`),
  navigation/section routing.
- [services/editor/](../../services/editor/) — server-side ops:
  artboard display (`artboard-display.ts`), image sizing
  (`image-sizing.ts`, `image-sizing-operations.ts`), workspace
  ops (`workspace-operations.ts`), and the heavy lifters in
  [server/](../../services/editor/server/) (master-image upload,
  crop, filter variants, working-copy management).
- DB: `project_workspace`, `project_image_state`, `project_images`,
  `project_image_filters`, `project_grid` — see
  [docs/domains/database.md](database.md).

## Key concepts

- **Pure model + Konva renderer split.** `lib/editor/canvas-model.ts`
  is pure math (fit/pan/zoom, no DOM); `features/editor/components/`
  wires Konva. Tests live next to the math, not the UI.
- **`px_u` everywhere a number is persisted.** Coordinates and
  sizes that hit the DB are stored as `text` "micro-pixels" (1µpx
  = 1/1000 px) to dodge floating-point drift across save/load. See
  [docs/domains/image-state.md](image-state.md) and
  [docs/specs/sizing-invariants.mdx](../specs/sizing-invariants.mdx).
- **Image `kind` enum**: `master | working_copy | filter_working_copy`
  on `project_images.kind`. Master is immutable (DB trigger
  `guard_master_immutable`); working copies are throwaway scratch.
- **`set_active_master_with_state` is the canonical bind RPC.** It
  links a `project_images` row to the `project_image_state` row in
  one transaction and is the only blessed path to switch active
  master. Two callers in app code:
  [lib/supabase/project-images.ts:249](../../lib/supabase/project-images.ts)
  and [app/api/projects/[projectId]/images/master/restore/route.ts:123](../../app/api/projects/%5BprojectId%5D/images/master/restore/route.ts).
- **Filter chain runs in two phases.** Frontend dispatches per-
  filter forms via a registry (see
  [docs/reference/filter-stack-findings.md](../reference/filter-stack-findings.md));
  server appends a row to `project_image_filters` and triggers
  the Python filter-service for actual pixel work. The result
  comes back as a new image with `kind='filter_working_copy'`.
- **XState orchestrates image work.** Long flows (upload, restore,
  crop, master-switch) live in `image-workflow.machine.ts` so
  intermediate states are explicit and testable.

## Data flow — restoring a master

```
user clicks "restore" in right panel
   → restore/route.ts
     ├── load baseMaster from project_images
     ├── compute placement via lib/editor/image-placement
     ├── set_active_master_with_state RPC (atomic bind)
     └── 200 { ok: true }
   ← UI re-renders from new project_image_state row
```

## Conventions

- **Never write to `project_image_state` directly.** Go through
  `set_active_master_with_state` (binds with the active master) or
  the typed helpers in `lib/supabase/image-state.ts`.
- **Every coord/size persisted is `*_px_u: text`**, not `numeric`.
  The numeric-from-string conversions live in
  `lib/editor/numeric.ts` + `lib/editor/units.ts`.
- **Filter forms always go through the registry** at
  `lib/editor/filters/`; don't add a form component that talks to
  the filter API on its own.
- **PascalCase for top-level container components**
  (`ProjectEditorStage.tsx`, `ProjectEditorRightPanel.tsx`) per
  [docs/conventions.md](../conventions.md). Atomic primitives are
  kebab-case.

## Process baseline (post-merge 2026-05-11)

Captures the user-facing flow across the three active editor tabs
and the invariants the recent trace-overlay series (#76 → #82 →
#83 → #84 → #86) established. Update this section when those
invariants change.

### Tabs

| Tab | Sidebar | State read | State written | Stage display |
|---|---|---|---|---|
| **Image** | layers (`editor-nav-tree`) | `masterImage`, `project_image_state` | `project_image_state` (transform), `project_images(kind='master')` | master image |
| **Filter** | filter stack (`FilterSidebarSection`) | `project_image_filters`, `filter_working_copy` | `project_image_filters`, `project_images(kind='filter_chain_step')` | `filterDisplayImageWithoutTrace` (raster tip) |
| **Trace** | trace section (`TraceSidebarSection`) | `project_image_trace`, raster filter tip | `project_image_trace` (single row), `project_images(kind='trace_svg')` | raster tip + transparent inline-SVG overlay |
| Colors / Output | — | — | — | disabled — feature-flag-gated dead surface |

### Invariants (do not regress)

- **Filter operates on raster, never on SVG.** PR #82 fixed a class
  where Filter would be applied to a trace SVG. Filter always reads
  `filterDisplayImageWithoutTrace`.
- **Trace source uses the same active-state resolver as Filter.** PR
  #83 unified the source picker. If you add a new operation that
  reads "the current image", route through the active-state resolver.
- **Trace is a transparent overlay above the raster filter tip.** PR
  #84 made the trace SVG render as a DOM-overlay on top of the
  Konva.Image, not as a replacement. PR #86 dropped the opaque white
  `<rect>` from the Python source so the underlying filter result
  shows through.
- **`traceOverlaySvgUrl` is gated on Trace-tab AND trace-aware ≠
  trace-free display IDs.** Otherwise the overlay either shows the
  wrong thing (on Filter/Image tab) or shows nothing useful (when
  there is no real trace artefact).

### State machine

[lib/editor/machines/image-workflow.machine.ts](../../lib/editor/machines/image-workflow.machine.ts)
runs three parallel sub-machines:

- `source` — `loading` / `ready` / `empty` / `error`. Reflects
  whether an active image is available.
- `operation` — `idle` / `applyingFilter` / `removingFilter` /
  `cropping` / `restoring` / `syncing` / `error`. Each terminal
  state passes through `syncing` (calls `refreshAll`) before
  returning to `idle`.
- `persistence` — `idle` / `persisting` / `drain` / `error`.
  Drain-queue absorbs rapid `TRANSFORM_SAVE` events so transforms
  aren't lost on fast user moves.

### Risks tracked (not yet addressed)

- `useEditorSessionState` has no schema-version key — a struct
  change crashes the editor on first reload of an existing user
  tab.
- `useMutationLeaveGuard` only covers in-flight server mutations,
  not dialog dirty state.
- `ProjectEditorShell.client.tsx` derives `canvasMode`,
  `canvasImage`, and `traceOverlaySvgUrl` inline; 56 imports.
- Disabled tabs (Colors, Output) are rendered as dead surface; user
  expectation drifts.

## Diagrams

These diagrams are part of the doc contract. If you change
`image-workflow.machine.ts` states or events, an `app/api/` route
path, or the render-layer composition in `project-canvas-stage.tsx`,
update the matching diagram in the same PR.

### Tab + state-machine overview

```mermaid
flowchart LR
  User[User]
  subgraph Tabs["Tabs"]
    Image[Image]
    Filter[Filter]
    Trace[Trace]
  end
  subgraph Machine["image-workflow.machine"]
    Source["source"]
    Op["operation"]
    Persist["persistence"]
  end
  subgraph Canvas["Konva Stage"]
    Layer1["Konva.Image (raster)"]
    Layer2["Inline DOM SVG (trace overlay)"]
  end
  User --> Tabs
  Image -->|FILTER_APPLY / CROP_APPLY / RESTORE| Op
  Filter -->|FILTER_APPLY / FILTER_REMOVE| Op
  Trace -->|TRACE_APPLY / TRACE_CLEAR| Op
  User -->|drag / resize| Persist
  Op --> Source
  Source --> Layer1
  Trace -.->|only when trace active| Layer2
```

### Filter pipeline lifecycle

```mermaid
sequenceDiagram
  autonumber
  participant UI as Filter Form
  participant M as Machine
  participant API as /api/projects/:id/filters/:type
  participant FS as filter-service (Python)
  participant DB as Supabase
  UI->>M: FILTER_APPLY
  M->>M: operation = applyingFilter
  M->>API: POST params
  API->>DB: getOrCreateFilterWorkingCopy
  API->>FS: process image
  FS-->>API: processed PNG
  API->>DB: insert project_images
  API->>DB: insert project_image_filters
  API-->>M: 200 OK
  M->>M: operation = syncing
  M->>API: refreshAll
  API-->>M: snapshot
  M->>M: operation = idle
```

### Trace pipeline + overlay composition

```mermaid
sequenceDiagram
  autonumber
  participant UI as Trace Wizard / Form
  participant Shell as ProjectEditorShell
  participant API as /api/projects/:id/traces
  participant FS as filter-service (Python vtracer)
  participant DB as Supabase
  participant Stage as Konva Stage
  UI->>Shell: onApplyTrace
  Shell->>API: POST
  API->>FS: numerate_to_svg or lineart_to_svg
  Note over FS: post-#86: no white background rect
  FS-->>API: SVG text
  API->>DB: upsert project_image_trace
  API->>DB: insert project_images (trace_svg)
  API-->>Shell: 200 OK
  Shell->>Shell: refresh trace + filterImage
  Shell->>Stage: canvasImage = filterDisplayImageWithoutTrace
  Shell->>Stage: traceOverlaySvgUrl = SVG url (only on Trace tab)
  Stage->>Stage: render raster + transparent SVG overlay
```

### Persistence drain queue

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> persisting: TRANSFORM_SAVE
  persisting --> idle: ok
  persisting --> drain: TRANSFORM_SAVE while in-flight
  drain --> persisting: prior request resolved
  persisting --> error: server error
  error --> idle: RETRY ok
```

### Render layers

```mermaid
flowchart TB
  subgraph Stage["Konva Stage"]
    Bg["Background / Artboard"]
    Img["Konva.Image — raster bitmap"]
    Sel["Selection overlay"]
  end
  subgraph DOM["DOM (above Konva)"]
    Svg["Inline SVG — trace outlines + grid"]
  end
  Bg --> Img
  Img --> Sel
  Sel --> Svg
```

## Common pitfalls

- **Forgetting `kind` filter on `project_images` queries.** Without
  `where kind = 'master'` (or matching), you'll pick up working
  copies. The recent `role → kind` migration broke older queries
  that used `role`.
- **Touching the master row directly.** The `guard_master_immutable`
  trigger rejects edits unless `app.deleting_project` is set. Use
  the bind RPC or replace the master via a new row.
- **Mixing `px` and `px_u` in the same calculation.** `px_u` is a
  string of micro-pixels; multiplying it by a number without going
  through `units.ts` helpers produces NaN.
- **Long-running canvas work without XState.** State racing across
  upload + filter + crop produces "ghost previews". Add a state to
  `image-workflow.machine.ts` instead.

## Cross-references

- [docs/domains/image-state.md](image-state.md) — `project_image_state`
  binding details, `px_u` semantics.
- [docs/domains/filter-pipeline.md](filter-pipeline.md) — full
  filter-stack flow.
- [docs/domains/storage.md](storage.md) — image upload/storage path
  conventions.
- [docs/specs/image-state-api.mdx](../specs/image-state-api.mdx),
  [docs/specs/sizing-invariants.mdx](../specs/sizing-invariants.mdx)
  — formal specs.
- [docs/reference/persistence.md](../reference/persistence.md) — save flow detail.
- Code: [lib/editor/canvas-model.ts](../../lib/editor/canvas-model.ts),
  [lib/editor/machines/image-workflow.machine.ts](../../lib/editor/machines/image-workflow.machine.ts).
