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

### What CI runs

- `npm run check`:
  - eslint
  - vitest
  - db schema marker drift check (`scripts/check-db-schema.mjs`)

