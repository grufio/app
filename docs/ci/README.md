## CI (GitHub Actions)

Workflows are committed in this repository under `.github/workflows/`.

Primary pipeline:

- `ci.yml`
  - job `lint_test`:
    - `npm run gate:ci`
    - optional remote checks (`check:remote`, `verify:remote-migrations`, `verify:remote-rls`, `verify:types-synced`) gated by available secrets/env
  - job `e2e`:
    - Playwright install/cache
    - `npm run test:e2e:ci:pr`

### Local gate commands

- `npm run gate:local`
  - lint + unit/contract tests + schema/bootstrap/RLS checks
  - does **not** require linked Supabase access
- `npm run gate:linked`
  - runs `gate:local` plus `verify:types-synced` with `SUPABASE_VERIFY_TYPES_SYNC=1`
  - use this when local env is linked/authenticated to Supabase
- `npm run gate:ci`
  - runs `gate:local` plus coverage
- `npm run gate:pre-release`
  - runs `gate:ci` plus remote migration/RLS/binding/type-sync checks

### Why `verify:types-synced` is optional by default

`verify:types-synced` compares generated types against a linked remote project. In environments without linked/authenticated Supabase access, this check is intentionally skipped unless explicitly enabled.

### Enforce CI on `main` (recommended)

Configure in GitHub settings:

- Enable branch protection for `main`
- Require status checks to pass before merge
- Add required check: `CI`


