## CI (GitHub Actions)

Workflows are committed in this repository under `.github/workflows/`.

Primary pipeline:

- `ci.yml`
  - job `lint_test`:
    - `npm run check:local`
    - `npm run test:coverage:gate`
    - optional remote checks (`check:remote`, `verify:remote-migrations`, `verify:remote-rls`, `verify:types-synced`) gated by available secrets/env
  - job `e2e`:
    - Playwright install/cache
    - `npm run test:e2e:ci:pr`

### Local gate commands

- `npm run check:local`
  - lint + unit/contract tests + schema/bootstrap/RLS checks
  - does **not** require linked Supabase access
- `npm run check:local:linked`
  - runs `check:local` plus `verify:types-synced` with `SUPABASE_VERIFY_TYPES_SYNC=1`
  - use this when local env is linked/authenticated to Supabase

### Why `verify:types-synced` is optional by default

`verify:types-synced` compares generated types against a linked remote project. In environments without linked/authenticated Supabase access, this check is intentionally skipped unless explicitly enabled.

### Enforce CI on `main` (recommended)

Configure in GitHub settings:

- Enable branch protection for `main`
- Require status checks to pass before merge
- Add required check: `CI`


