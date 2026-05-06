# App Review — Status (2026-05-06)

Status of items from `docs/app-review.md` (see PR #1 once merged).
Rows mark which branch addresses each finding.

## Blockers

| ID | Title | Status | Branch / PR |
|----|----|----|----|
| B1 | Auth-Flow ist untested | ✅ done (smoke + unit) | `test/auth-flow-e2e` |
| B2 | `database.types.ts` nicht im CI-Gate | ✅ done (offline diff guard) | `chore/types-sync-ci-gate` |
| B3 | Master-Image-Upload ohne sichtbare Größenlimits | ✅ done (default + pixel cap) | `chore/upload-size-explicit-limits` |
| B4 | `project-canvas-stage.tsx` ist 908 Zeilen | 🟡 partial (-73 LOC, dedup) | `refactor/canvas-stage-split` |

B4 was scoped down: the full split (4-6h, into wrapper / image-layer /
selection-overlay / controls-sync) needs canvas-interaction E2E tests as a
prerequisite (called out in the plan). The submitted PR removes the
duplicate inline `SelectionOverlay` and wires in the existing
`canvas-stage/selection-overlay.tsx`. Further splits should land
incrementally, each behind new E2E coverage.

## Smells

| ID | Title | Status | Branch |
|----|----|----|----|
| S1 | Filter-Form-Duplikation | ✅ done (FilterFormFooter extracted) | `refactor/use-filter-form-hook` |
| S2 | `force-dynamic` auf 17/20 Routes | ✅ docs (verified correct) | `perf/force-dynamic-audit` |
| S3 | Keine Dynamic Imports für Editor | ✅ already done on main | — |
| S4 | Visual-Tests zu schmal | 🟡 spec ready, baselines pending | `test/visual-regression-expand` |
| S5 | Coverage-Threshold zu niedrig | ✅ first bump (22→23, 60→65, 35→70) | `chore/coverage-threshold-raise` |
| S6 | Service-Role-Konvention nicht durchgesetzt | ✅ done (verify-service-role-usage in gate:local) | `chore/service-role-lint-rule` |
| S7 | npm audit Vulnerabilities | ✅ done (12→0) | `chore/npm-audit-fix` |
| S8 | `image-panel.tsx` ist 451 Zeilen | ✅ done (split into 4 files) | `refactor/image-panel-split` |
| S9 | Signed-URL-TTL inkonsistent | ✅ done (lib/storage/signed-url-ttl) | `perf/signed-url-ttl-consolidate` |
| S10 | Filter-Service Unit-Test-Lücken | ✅ done (toInt/pickOutputFormat/contentTypeFor) | `refactor/filter-validators-extract` |
| S11 | Naming-Mix bei File-Namen | ✅ docs (no mass rename) | `chore/file-naming-convention` |
| S12 | Error-Reporting nur `console.error` | ✅ wired to auth callback + tests | `chore/error-reporting-wire-up` |

S4: 6 visual tests added with `.skip` + a comment explaining how to
generate baselines locally (`npm run test:e2e:visual:update`). Skipping
keeps the gate green; un-skipping is a one-line follow-up after baseline
PNGs are committed.

## Nits

| ID | Title | Status | Branch |
|----|----|----|----|
| N1 | JSDoc-Coverage uneinheitlich | ✅ scoped warn (auth + monitoring) | `chore/jsdoc-coverage-rule` |
| N2 | HTTP-Cache-TTL kurz (2s) | ✅ bumped to 5s | `perf/http-cache-ttl` |
| N3 | Grid-Provider Context-Value nicht memoized | ✅ already done on main | — |
| N4 | XState nur für Editor-Workflow | 🚫 deferred (optional, langfristig) | — |
| N5 | 40+ npm scripts | ✅ grouped in README | `docs/readme-quickstart` |
| N6 | `e2e/_mocks.ts` undokumentiert | ✅ done | `docs/e2e-mocks-jsdoc` |
| N7 | Env-Vars-Validation fehlt | ✅ done (lib/env helpers) | `chore/env-vars-validation` |
| N8 | Inconsistente Funktions-Stile | ✅ scoped warn (.ts only) | `chore/function-style-rule` |
| N9 | Playwright-Flaky-Metrics ohne Auswertung | ✅ GH-Action annotations + rate | `chore/playwright-flaky-alert` |
| N10 | Doc-Lücke: Onboarding | ✅ done (README + conventions) | `docs/readme-quickstart` |

## Summary

- **22 items addressed** out of 26 (B1-B4 + S1-S12 + N1-N10, excluding S3 and N3 which were already done, plus N4 deferred).
- **20 PR branches pushed** to origin; one batch summary docs PR (this file).
- **Coverage**: 23.45% lines / 69.16% branches / 71.95% functions on main; the test-adding PRs in this batch (B1, B3, S10, S12, N7) lift it further.
- **Gate hardening**: `gate:local` gained `verify:service-role-usage`; `gate:ci` gained `check:types-with-migrations`.
- **Security**: 12 npm-audit vulnerabilities → 0; service-role usage allowlisted; auth + auth-redirect helpers + reporter under unit test.

## Next steps (already-flagged follow-ups)

1. **Generate visual-regression baselines** for the 6 skipped specs in
   `e2e/forms.visual.spec.ts`. Run `npm run test:e2e:visual:update`,
   commit PNGs, remove `.skip`.
2. **Continue B4** — split `project-canvas-stage.tsx` into wrapper /
   image-layer / selection-overlay / controls-sync incrementally,
   each behind canvas-interaction E2E coverage.
3. **Coverage threshold** climbs to 30 / 40 / 50 over follow-up PRs as
   more services pick up unit tests (start with the master-image-upload
   handler and `services/projects/server/dashboard.ts`).
4. **Expand JSDoc rule scope** from `services/auth + lib/auth + lib/monitoring`
   outward, file by file, flipping `warn → error` when a slice is clean.
5. **Address func-style warnings** in steady state — 56 const-arrow
   exports in `.ts` files want migration to declarations.
