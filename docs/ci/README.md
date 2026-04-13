## CI (GitHub Actions)

This repo commits CI workflows under `.github/workflows/*.yml`.

### Gate tiers

- **PR / push gate (`CI`)**: deterministic local/static checks + optional remote checks if secrets are present.
- **Nightly E2E gate (`Nightly E2E`)**: broader Playwright tier on schedule/manual trigger.
- **Pre-release gate (`Pre-release gates`)**: manual hard gate requiring Supabase remote verification.

### Enforce CI on `main` (recommended)

This must be configured in GitHub settings (cannot be automated from within the repo):

- Enable **Branch protection** for `main`
- Turn on:
  - **Require a pull request before merging**
  - **Require status checks to pass before merging**
  - Add required check: **CI**
  - (Optional) **Require branches to be up to date before merging**

### What PR CI runs

- `npm run check:ci` (lint + tests + db static checks + coverage gate)
- Optional remote DB checks when secrets are available:
  - `npm run verify:remote-migrations`
  - `npm run verify:remote-rls`
  - `npm run verify:types-synced`
- Playwright PR smoke tier

### DB migrations (runtime)

CI validates drift/contract checks, but it does **not** replace explicit migration rollout ownership.

See `docs/migrations.md` for the canonical migration pipeline.

### Required secrets for remote gates

- `SUPABASE_DB_PASSWORD`
- `SUPABASE_DB_URL`


