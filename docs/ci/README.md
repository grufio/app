## CI (GitHub Actions)

This repo intentionally does **not** commit `.github/workflows/*.yml` by default.

Reason: some setups (OAuth apps / tokens without the `workflow` scope) cannot push workflow changes, which blocks `git push`.

### Enable CI

1. Copy the template:

```bash
mkdir -p .github/workflows
cp docs/ci/github-actions-ci.yml.template .github/workflows/ci.yml
```

2. Commit & push using credentials that have permission to update workflows (GitHub PAT with `workflow` scope).

### Enforce CI on `main` (recommended)

This must be configured in GitHub settings (cannot be automated from within the repo):

- Enable **Branch protection** for `main`
- Turn on:
  - **Require a pull request before merging**
  - **Require status checks to pass before merging**
  - Add required check: **CI**
  - (Optional) **Require branches to be up to date before merging**

### What CI runs

- `npm run check:ci`:
  - eslint
  - vitest
  - db schema marker drift check (`scripts/check-db-schema.mjs`)
  - `next build`

### DB migrations (runtime)

CI validates that `db/schema.sql` includes all migration markers, but it does **not** apply migrations to your Supabase project.

See `docs/migrations.md` for how to apply new `db/0xx_*.sql` migrations safely.

### Optional: E2E in CI

The template `docs/ci/github-actions-ci.yml.template` includes a Playwright Chromium install + `npm run test:e2e`.
If you don't want E2E in CI (yet), you can remove those two steps from `.github/workflows/ci.yml`.


