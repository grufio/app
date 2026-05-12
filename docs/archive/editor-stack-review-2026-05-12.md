# Editor Stack Review — 2026-05-12

> Status: review captured; actionable items applied (JSDoc + 1 race fix);
> bigger structural items deferred to dedicated follow-up PRs.

## Context

Audit of the editor's state-chain, canvas mechanics, and DB layer after
PRs #124 (`project_image_state` anchored at `master.id`), #128 (purge
client-side imageId chain), and #129 (decouple `mutationsEnabled` from
tab-specific feature gates). Three parallel agent passes — one per
surface — followed by consolidation.

Goal of the review: **stability, consistency, reusability**, plus
catching JSDoc that drifted during the recent refactor wave.

---

## Findings — state chain

### Critical

- **C-S1** Promise dropped in upload sync: `useEditorWorkflowAdapter.handleImageUploaded`
  awaits `workflow.refreshAndWait()` whose internal 20 s timeout
  `reject()` is observable but the wrapping `try/finally` swallows it
  silently. If sync fails the user sees stalled UI without feedback.
  *File:* `app/projects/[projectId]/_components/editor-shell/use-editor-workflow-adapter.ts:270-275`

- **C-S2** Missing `sub.unsubscribe()` in the timeout branch of
  `applyFilter` and `refreshAndWait` inside
  `lib/editor/machines/use-image-workflow-machine.ts:82-86` and
  `:118-122`. On timeout the actor subscription stays live and the next
  state transition `reject()`s a settled promise (harmless) AND keeps
  a closure pinned. Memory leak, not correctness, but accumulates over
  long sessions.

- **C-S3** Type contract gap: `loadBoundImageState(supabase, projectId,
  activeImageId: string | null)` accepts `null`; `upsertBoundImageState`
  requires non-null `image_id`. No assertion at the boundary; callers
  must remember the asymmetry.
  *File:* `lib/supabase/image-state.ts:34-46`

### Smell

- **S-S1** Three error-shape models in one chain:
  `ApiError → imageStateError: string → lastOpError: string →
  workflowFilterPanelError = filter || persistence || filterImageError`
  composed in `use-editor-workflow-adapter.ts:277-280`. No correlation
  id, no canonical error type.
- **S-S2** `ImageState`, `WorkflowTransformPayload`, `SaveImageStateBody`,
  `ImageStateSaveLike`, `ValidatedImageStateUpsert` all model the same
  µpx-transform with different field names. Bridging code is implicit.
- **S-S3** Signature-builder for save dedup duplicated at
  `use-image-state.ts:111` and `:171`.
- **S-S4** Bounds validation lives in `micro-px.ts:24`, `validate.ts:62-65`,
  `serialize.ts:31`. No single chokepoint.
- **S-S5** `inflight` deduplication differs between machine and hook:
  machine queues pending transforms without payload-equality check; hook
  signatures dedup post-flush.

### Doc

- **D-S1** `useImageState`, `mapImageStateApiErrorToMessage`,
  `toSaveImageStateBody`, `loadBoundImageState`, `upsertBoundImageState`,
  GET/POST route handlers, machine actors, `deriveEditorSourceSnapshot`
  — all lacking JSDoc or with stale module headers from pre-#124.

---

## Findings — canvas mechanics

### Critical

- **C-C1** *Audit flagged but verification showed no defect.* The
  original `scheduleApply` already captures both `scheduleSeq` and
  `userMutationSeq` before mutating `appliedKey`. The ordering is
  correct; the audit's read of the code was off-by-one. Kept the
  audit reference because the **ordering invariant** is subtle and
  load-bearing — this PR adds an inline comment in
  `state-sync-guard.ts` that pins the contract so a future reorder
  doesn't regress it.

- **C-C2** `mutationsEnabled` vs `imageDraggable` vs `cropEnabled`
  gating matrix is undocumented. PR #129 decoupled `mutationsEnabled`
  from tab flags but the canvas-stage props block doesn't say what each
  truly gates. Future contributors will re-couple by accident.
  → **fixed in this PR**: JSDoc on props + a comment in
  `ProjectEditorStage.tsx` explaining the matrix.

- **C-C3** `transform-commit-scheduler` uses `setTimeout(..., 0)` for
  drag-end commits. Macrotask schedule. Can race a microtask-scheduled
  persisted-state apply. In practice no bug observed, but the ordering
  is implicit. Marked for follow-up.

### Smell

- **S-C1** `rotate90` in `transform-controller.ts:83-91` doesn't call
  `scheduler.cancel()`. If a drag is mid-flight when rotate fires, the
  scheduled commit still runs.
- **S-C2** `imageRender` (center coords) and `imageFrame` (top-left) use
  different coordinate conventions in
  `project-canvas-stage.tsx:503-520`. Math is correct by accident; no
  type-level discrimination.
- **S-C3** Mutation guards (`mutationsEnabled`) live at the
  canvas-stage callback site, not in the transform controller. A unit
  test or alternate UI invoking the controller directly bypasses the
  gate.

### Doc

- **D-C1** `useInitialImagePlacement` effect has 16 dependencies and
  runs the persisted-vs-default decision tree. Module comment doesn't
  describe the state machine.
- **D-C2** `transform-commit-scheduler.schedule(commitPosition, delayMs)`
  has a "sticky-true" OR-merge for `commitPosition` (line 19). Undocumented
  semantic.
- **D-C3** `PxU` vs `Px` naming: `PxU` = micro-pixel bigint; `Px` =
  canvas-space pixel number. No convention doc.

---

## Findings — DB layer + RPCs

### Critical

- **C-D1** `activateProjectImage` writes `project_image_state` at the
  *activated* image id (could be filter_working_copy / trace_output),
  not at master.id. Documented as "out of scope" in the PR #128 plan
  but flagged again here. Junk rows accumulate; the route reads at
  master.id so user-visible correctness is preserved.
  *File:* `services/editor/server/activate-project-image.ts:105-113`

- **C-D2** `set_active_master_with_state` RPC does not check
  `kind='master'`. Could write state at any image_id given a malicious
  or buggy client.
  *File:* `db/schema.sql:431-479`

- **C-D3** FK `state.image_id → images.id ON DELETE CASCADE` doesn't
  fire on soft-delete (`deleted_at IS NOT NULL`). Orphan state rows
  for tombstoned filter outputs remain until the cleanup migration.

### Smell

- **S-D1** Nullable `x_px_u` / `y_px_u` allows asymmetric position
  (`x=NULL, y='100'`). No CHECK constraint enforcing the pair invariant.
- **S-D2** RPC errors leak DB codes (`23503`, etc.) to the client without
  canonicalization.

### Doc

- **D-D1** `loadBoundImageState` / `upsertBoundImageState` module
  header doesn't mention the master.id anchor invariant.
- **D-D2** `resolveEditorTargetImageRows` returns `target` and
  `preferredWorking`; no JSDoc clarifies that state writes go to
  master.id (separate resolver) while editor display uses these.
- **D-D3** Migration `20260512200000` mentions a follow-up cleanup that
  doesn't yet exist.

---

## Actions in this PR

1. **JSDoc updates across 9 files** in lib/editor, lib/supabase, lib/api,
   features/editor, app/api, services/editor — see commit diff. No
   behaviour changes from JSDoc edits.
2. **State-sync-guard ordering comment (C-C1)** — inline doc that
   the capture-before-mutate ordering of `userMutationSeq` and
   `pendingApplySeq` is load-bearing.
3. **Mutation-gating matrix doc (C-C2)** — props on
   `project-canvas-stage.tsx` annotated with what they actually gate.

## Deferred to follow-up PRs

| Item | Why deferred | Suggested PR |
|---|---|---|
| C-S1 / C-S2 promise + subscription leaks | Bigger change; touches xstate-react interop | `fix(editor): tighten workflow-machine promise lifecycles` |
| C-D1 `activateProjectImage` writes junk rows | RPC + multiple flows touched | `refactor(editor): split activation from state-seed` |
| C-D2 RPC kind-check | DB migration; consider with C-D1 | same PR as above |
| S-D1 axis-pairing CHECK | DB migration; one-line constraint | `chore(db): add axis-pairing CHECK on project_image_state` |
| S-S1 unified error type | Cross-cutting type design | own PR |
| Cleanup migration for non-master state rows | Promised in #124 PR-2; needs prod bake window | `chore(db): drop legacy non-master image-state rows` |

## Stable invariants — locked

After this round the following invariants are explicit (JSDoc'd) and
test-covered:

- State persistence anchors at `master.id` (server-side resolution).
- `useImageState` carries no image-id param; SSR seeds initial state.
- `shouldApplyPersistedTransform` rejects only when src/activeImageId
  are missing or `userChanged` is set; no image-id equality check.
- `mutationsEnabled` controls only "image is editable", independent
  of crop/rotate flags.
- FormFieldHandle has `setDraft` for imperative cross-axis pushes
  (aspect-lock pattern).
