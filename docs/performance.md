## Performance guardrails (editor MVP)

The editor’s performance-sensitive paths are concentrated in `ProjectCanvasStage` and its `canvas-stage/*` controllers.

### Key invariants

- Avoid synchronous `getClientRect()` / bounds reads in hot render paths.
- Batch bounds recomputation via RAF scheduling.
- Keep transform persistence debounced for continuous interactions, but commit immediately for explicit actions.

### Existing counters / checks

- E2E exposes a counter on `globalThis.__gruf_editor.boundsReads`.
  - Used by Playwright to ensure drags/pans do not explode bounds reads.

### Suggested thresholds (MVP)

These are “smoke” thresholds, not hard guarantees:

- **Drag**: \(\le 3\) bounds reads for a single drag interaction.
- **Pan wheel**: \(\le 2\) bounds reads for a pan tick.

If these regress, investigate:
- `components/shared/editor/canvas-stage/bounds-controller.ts`
- `components/shared/editor/canvas-stage/raf-scheduler.ts`
- `components/shared/editor/project-canvas-stage.tsx`

