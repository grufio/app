## Performance guardrails (editor MVP)

The editor’s performance-sensitive paths are concentrated in `ProjectCanvasStage` and its `canvas-stage/*` controllers.

### Key invariants

- Avoid synchronous `getClientRect()` / bounds reads in hot render paths.
- Batch bounds recomputation via RAF scheduling.
- Keep transform persistence debounced for continuous interactions, but commit immediately for explicit actions.

### Existing counters / checks

- E2E exposes counters on `globalThis.__gruf_editor`:
  - `boundsReads`: increments when bounds are recomputed from nodes.
  - `clientRectReads`: increments when rotation forces `getClientRect()`-style bounds reads.
  - `rafScheduled`: increments when a new RAF frame is scheduled (coalesced).
  - `rafExecuted`: increments when the RAF callback executes.

### Suggested thresholds (MVP)

These are “smoke” thresholds, not hard guarantees:

- **Drag**: \(\le 3\) `boundsReads` and \(\le 3\) `clientRectReads` for a single drag interaction.
- **Pan wheel**: \(\le 2\) `boundsReads` and \(\le 2\) `clientRectReads` for a pan tick.
- **RAF**: \(\le 6\) `rafExecuted` for the drag interaction and \(\le 3\) for a pan tick.

If these regress, investigate:
- `features/editor/components/canvas-stage/bounds-controller.ts`
- `features/editor/components/canvas-stage/raf-scheduler.ts`
- `features/editor/components/project-canvas-stage.tsx`

