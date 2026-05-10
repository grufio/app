# CI & Deploy

## Purpose

Three workflows: `ci.yml` (per-PR gates with path-dispatch),
`deploy.yml` (production deploys with approval gate), and
`deploy-filter-service.yml` (Cloud Run for the Python service).
The CI workflow uses a `detect` job to skip irrelevant heavy jobs
based on what changed — doc-only PRs run in ~1 min, full code+DB
in ~6 min.

## Where it lives

- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — per-PR
  CI: `detect` + `lint_test` + `remote_verify` + `integration` +
  `e2e` + `e2e_visual`. Path-gated.
- [.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)
  — auto-deploy on `main`: applies pending migrations to prod
  behind a `production-db` GitHub Environment (required reviewer),
  then triggers the Vercel deploy hook.
- [.github/workflows/deploy-filter-service.yml](../../.github/workflows/deploy-filter-service.yml)
  — Cloud Run deploy for [filter-service/](../../filter-service/)
  on changes to its directory.
- [scripts/](../../scripts/) — gate scripts (`verify-rls.mjs`,
  `verify-schema-drift.mjs`, `check-db-schema.mjs`, etc.).

## Path-dispatch matrix (ci.yml)

| Job | Triggers when |
|---|---|
| `detect` | always |
| `lint_test` | always (smoke gate) |
| `remote_verify` | `has_db` (and non-fork) |
| `integration` | `has_code` OR `has_db` |
| `e2e` | `has_code` |
| `e2e_visual` | `has_ui` (forms/components/features/.tsx/.css/lib/forms/lib/ui) |

## Key facts

- **Vercel auto-deploy is OFF on `main`** — the Vercel hook is
  invoked from `deploy.yml` only after migrations succeed. Settings
  → Git → "Ignored Build Step": `exit 0`.
- **Required secrets for deploy.yml:** `SUPABASE_PROJECT_REF`,
  `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`,
  `VERCEL_DEPLOY_HOOK_URL`. Optional: `SLACK_ALERT_WEBHOOK_URL`.
- **`SUPABASE_DB_URL` must use the Session Pooler** (not direct
  connection) — runners can't reach Supabase's IPv6 direct host.
- **`gate:pre-release` npm script** stays as a local validation
  chain. The pre-release.yml workflow itself was consolidated into
  ci.yml (PR #47).

## Cross-references

- **CI pipeline detail:** [docs/ci/README.md](../ci/README.md)
- **Release procedure:** [docs/checklists/release.md](../checklists/release.md)
- **Test lanes that run in CI:**
  [domains/testing-strategy.md](testing-strategy.md)
- **Database deploy detail:** [domains/database.md](database.md)
