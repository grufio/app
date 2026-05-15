# Testing Strategy

## Purpose

The repo has three test lanes — **unit**, **integration**, **E2E** —
each pinned to a different fidelity-vs-speed trade-off. Together they
gate every PR via `gate:ci` and `gate:pre-release`. Knowing which lane
a new test belongs in saves hours of CI time and stops the slow lanes
from inheriting fragile work that should have been a fast unit test.

## Where it lives

- `lib/**/*.test.ts`, `services/**/*.test.ts`,
  `components/**/*.test.ts`, `features/**/*.test.ts`,
  `app/**/*.test.ts` — **unit tests** colocated next to source
  (~92 files today). Driven by [vitest.config.ts](../../vitest.config.ts).
- [tests/integration/](../../tests/integration/) — **integration
  tests** that run against a local Supabase started via
  `supabase start`. Single-threaded.
  Driven by [vitest.integration.config.ts](../../vitest.integration.config.ts).
- [e2e/](../../e2e/) — **Playwright E2E** specs (3 today:
  `editor.boot.spec.ts`, `auth-flow.spec.ts`, `forms.visual.spec.ts`).
- [scripts/run-integration-tests.mjs](../../scripts/run-integration-tests.mjs)
  — CI wrapper that boots Supabase, captures connection details,
  then runs the integration suite.
- [docs/qa/editor-regression-checklist.md](../qa/editor-regression-checklist.md)
  + [docs/qa/playwright-soll-ist-matrix.md](../qa/playwright-soll-ist-matrix.md)
  — manual QA checklist + the should/is matrix that decides which
  scenarios get an automated e2e test.

## Key concepts

- **Three pools, three configs** — unit and integration use
  different `vitest.*.config.ts` files because integration tests
  can't share a worker (they share a real DB). Don't merge the
  configs.
- **Coverage threshold** is set in [vitest.config.ts](../../vitest.config.ts)
  (`thresholds: lines 24, functions 73, branches 72, statements 24`).
  CI fails if the metric drops. Adjust thresholds upward when adding
  meaningful tests; never lower them to make a red gate green.
- **E2E grep tags** — `smoke:` and the `forms.visual` spec are
  selected via Playwright `--grep` patterns from
  [package.json](../../package.json). The PR `e2e` job runs `smoke:`;
  the PR `e2e_visual` job runs `forms.visual.spec.ts` (gated on
  `has_frontend` paths — see [domains/ci-deploy.md](ci-deploy.md)
  for the full category list).
- **Integration test fixtures** are seed-then-cleanup, not shared.
  See [tests/integration/_setup.ts](../../tests/integration/_setup.ts):
  `seedProject({ ownerId? })` + matching `cleanupProject(id)`.

## Where each test goes

| Goal | Lane | Why |
|---|---|---|
| Pure logic, reducer, hook with no DB | unit | <2 s suite, runs in every gate |
| Database invariant (RLS, RPC, schema constraint) | integration | Real Postgres needed; exercises actual policies and triggers |
| User-visible flow that crosses route + DB + UI | E2E | Catches integration bugs invisible to lower lanes |
| Visual regression (component snapshot) | E2E `forms.visual` | Captures pixel diffs |

## Conventions

- **Colocate unit tests with source** (`lib/forms/normalize-hex.ts`
  → `lib/forms/normalize-hex.test.ts`). Easier to discover; the
  `vitest.config.ts` `include` already matches.
- **Integration tests live in `tests/integration/`**, not next to
  code. They need the Supabase boot wrapper.
- **Self-contained tests** — each integration test seeds what it
  needs and cleans up in `afterEach`. Cross-test state coupling
  breaks the suite under reordering.
- **E2E tags** are mandatory. Untagged Playwright tests are picked
  up by the PR run.
- **No mocked Supabase in integration tests** — that's what the unit
  lane is for. If a query "needs a mock", it's a unit test in
  disguise. (See user memory: integration tests must hit real DB.)

## Common pitfalls

- **Forgetting the integration lane runs in CI only with secrets.**
  `npm run test:integration` works locally because `supabase start`
  is up; CI uses `scripts/run-integration-tests.mjs` to boot it
  fresh. If a test passes locally and fails in CI, suspect a state
  assumption that doesn't survive a fresh boot.
- **Adding a unit test that imports from `@supabase/supabase-js`
  directly** triggers the realtime/WebSocket polyfill issue noted in
  `tests/integration/_setup.ts`. Use the test shim or move the test
  to the integration lane.
- **Running `npm run test` and expecting integration tests to run.**
  They don't — integration is a separate command (`npm run
  test:integration`). The unit lane stays Docker-independent on
  purpose.
- **Lowering coverage thresholds to ship.** Don't. Add a test for
  the new code; thresholds are intentional ratchets.

## Cross-references

- [docs/ci/README.md](../ci/README.md) — which lane runs in which gate.
- [docs/qa/playwright-soll-ist-matrix.md](../qa/playwright-soll-ist-matrix.md)
  — what to add to E2E vs. defer to manual QA.
- [docs/domains/database.md](database.md) — schema/migration setup that
  integration tests exercise.
- [docs/domains/ci-deploy.md](ci-deploy.md) — how the lanes are wired
  into the PR CI dispatch.
- Code: [vitest.config.ts](../../vitest.config.ts:33-58) coverage block;
  [scripts/run-integration-tests.mjs](../../scripts/run-integration-tests.mjs:1-30)
  for the Supabase-boot wrapper.
