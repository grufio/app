# sys-update — Follow-up plan

Single branch (`sys-update`) covering the four "next steps" from
`docs/app-review-status.md`. One commit per work item so the diff
stays reviewable.

## Items

### 1. Visual-regression baselines for the 6 skipped specs (S4 follow-up)

`e2e/forms.visual.spec.ts` ships 6 `.skip` tests for filter dialogs
and confirm modals. Goal:

- Run `npm run test:e2e:visual:update` to generate baselines.
- Commit the new PNGs under
  `e2e/forms.visual.spec.ts-snapshots/*-chromium-darwin.png`.
- Remove the `.skip` markers and any TODO comments.

**Risk**: Playwright + dev server must boot cleanly. If snapshot
generation flaps for non-deterministic reasons (animation timing,
icon font loading), abort and document the blocker — don't commit
baselines that won't reproduce in CI.

### 2. Coverage threshold lift toward 30% (S5 follow-up)

Add unit tests for two service modules that are currently 0%-covered
and pull coverage upward:

- `services/projects/server/dashboard.ts` — listDashboardProjects has
  pure mapping logic (mapDashboardRow) that is straightforward to test.
- `services/editor/server/master-image-upload/validation.ts` — already
  has `parseOptionalPositiveInt`, `parseAllowedMimeList`, etc. that are
  pure functions.

Then bump `vitest.config.ts` thresholds:

- lines:      24.41 → 25
- statements: 24.41 → 25
- branches:   70.75 → 70 (already comfortably above)
- functions:  72.94 → 72 (already comfortably above)

Conservative bump just below current actuals (no big jumps that other
PRs would block on).

### 3. JSDoc rule expansion (N1 follow-up)

`eslint.config.mjs` currently scopes `jsdoc/require-jsdoc` to
`services/auth/**`, `lib/auth/**`, `lib/monitoring/**`. Expand to:

- `lib/storage/**` (just `signed-url-ttl.ts` from PR #13 today)
- `lib/api/**`     (small surface, mostly `http.ts` + `route-guards.ts`)
- `lib/env.ts`     (3 small exports added in N7 today)

For each newly-scoped file: add JSDoc on every flagged export, then
verify `npx eslint` shows no JSDoc warnings on those files.

### 4. Canvas-stage extraction continuation (B4 follow-up)

`features/editor/components/project-canvas-stage.tsx` is still 835
LOC. The plan flagged "needs canvas-interaction E2E tests as a
prerequisite". Without those E2E tests we keep extractions minimal:

Pull purely-presentational sub-trees out into co-located files:
- the artboard background `<Rect>` / border `<Line>` block (lines
  ~700-900) → `canvas-stage/artboard-overlay.tsx`
- the grid lines `<Line>` block → `canvas-stage/grid-overlay.tsx`

Both are pure render paths that read view + bounds and emit Konva
nodes — no event handlers, no refs back into the parent. Risk is
limited to import wiring.

If either extraction adds non-trivial prop plumbing, abort that one
and document — do not force.

## Execution order

Bottom-up by risk:

1. JSDoc expansion (item 3) — tiny, mechanical
2. Coverage tests + threshold (item 2) — bounded, additive
3. Visual baselines (item 1) — heavy, but isolated to e2e/
4. Canvas extractions (item 4) — last, can be aborted without rolling
   back the rest

Each is its own commit; the merge of `sys-update` into `main` is one
PR with 4 distinct commits.

## Verification

- After every commit: `npm run check` green.
- After item 2: `npm run test:coverage:gate` green at the new
  threshold.
- After item 1: `npm run test:e2e:visual` green (no `--update`).
- After item 4: visual snapshots still match (so they catch any
  Konva-render regression caused by the move).

## Definition of Done

- 4 commits on `sys-update`.
- `gate:ci` green locally.
- All 4 follow-up bullets in `docs/app-review-status.md` flipped to
  ✅ in a final docs commit.
