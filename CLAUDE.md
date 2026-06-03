# CLAUDE.md — Repo Context for Claude Code

This file is auto-loaded into every Claude Code session for this repo.
Keep it short (< 200 lines). Deep-dives belong in [docs/domains/](docs/domains/).

## What gruf.io is

gruf.io is a graphical editor for image-based pattern generation
(pixelate, lineart, numerate filters → vector/raster output for
print/PDF). Single-user app, hosted on Vercel + Supabase + a small
Cloud Run filter-service in Python.

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, Konva for canvas,
  Tailwind 4, TypeScript strict.
- **Backend:** Supabase (Postgres 17, Auth, Storage, RLS).
  Schema migrations in [supabase/migrations/](supabase/migrations/),
  prod mirror in [db/schema.sql](db/schema.sql).
- **Filter execution:** Python FastAPI in
  [filter-service/](filter-service/), deployed to Google Cloud Run.
  Frontend calls it via signed URLs.
- **CI/CD:** GitHub Actions (`ci.yml`, `deploy.yml`,
  `deploy-filter-service.yml`). Vercel triggers via deploy hook
  from `deploy.yml` (no auto-deploy on `main`). `ci.yml` uses a
  `detect` job + path-dispatch so doc-only PRs run in ~1 min.

## Domain map (entry points to deep-dives)

| Domain | Primary code | Detail doc |
|---|---|---|
| Image editor (Konva canvas, master/working) | [lib/editor/](lib/editor/), [features/editor/](features/editor/), [services/editor/](services/editor/) | [docs/domains/image-editor.md](docs/domains/image-editor.md) |
| Image state (`px_u`, active master, version chain) | [lib/supabase/image-state.ts](lib/supabase/image-state.ts), `project_image_state` table | [docs/domains/image-state.md](docs/domains/image-state.md) |
| Filter pipeline (FE forms → API → Python service) | [features/editor/components/](features/editor/components/), [services/editor/server/](services/editor/server/), [filter-service/](filter-service/) | [docs/domains/filter-pipeline.md](docs/domains/filter-pipeline.md) |
| Forms / UI controls (24px grid, draft reducer) | [components/ui/form-controls/](components/ui/form-controls/), [lib/forms/](lib/forms/) | [docs/domains/forms.md](docs/domains/forms.md) |
| API routes / orchestration | [app/api/](app/api/) | [docs/domains/api-architecture.md](docs/domains/api-architecture.md) |
| Project lifecycle (create, soft-delete, generation) | [services/projects/](services/projects/), `delete_project` RPC | [docs/domains/project-lifecycle.md](docs/domains/project-lifecycle.md) |
| Auth + RLS (owner-only, service-role bypass rules) | [lib/auth/](lib/auth/), `auth.uid()` policies in schema | [docs/domains/auth-rls.md](docs/domains/auth-rls.md) |
| Storage (project_images bucket, image upload flow) | [lib/storage/](lib/storage/), `storage.objects` policies | [docs/domains/storage.md](docs/domains/storage.md) |
| Database (migrations, schema-drift gates) | [supabase/migrations/](supabase/migrations/), [db/schema.sql](db/schema.sql) | [docs/domains/database.md](docs/domains/database.md) |
| Testing (vitest, integration, Playwright) | [tests/integration/](tests/integration/), [e2e/](e2e/) | [docs/domains/testing-strategy.md](docs/domains/testing-strategy.md) |
| CI / Deploy | [.github/workflows/](.github/workflows/), [scripts/](scripts/) | [docs/domains/ci-deploy.md](docs/domains/ci-deploy.md) |
| Undo / history | branch `feat/undo-foundation` (not on main yet) | _(no doc yet — add when feature lands)_ |

## Read me first — repo conventions

Anything below overrides "common practice" for this repo:

1. **Branch + PR Pflicht.** Never push directly to `main`. Every change:
   `git checkout -b <branch>` → push → `gh pr create` → user reviews + merges.
2. **No unsolicited features.** Refactor + consistency work is OK.
   New UI surfaces or API endpoints require explicit user ack — even if
   they appear "in the plan".
3. **Root cause over symptom patch — keine Fixes, keine Hacks, nur
   nachhaltige Lösungen.** When a bug surfaces:
   - **First understand the actual failure** before proposing
     anything. Read the code paths, the recent commits in the
     affected area, the test output, the server logs. If you cannot
     name the concrete failing line + reason, you do NOT yet know
     enough to propose a fix.
   - **Never propose "add diagnostics, then we'll see"** as a
     standalone fix. Adding visibility (toasts, logs, telemetry) so
     that the user can repro the bug and tell you the message back
     is a fix-style band-aid that delays the real work and burns
     iterations. Investigate properly upfront — read commit diffs,
     run targeted tests, trace the call chain end-to-end.
   - **Ask why existing tooling didn't catch it; close the gate,
     don't just fix the symptom.** If a regression slipped past
     tests, the structural fix includes the missing test, not just
     the code patch.
   - If you genuinely cannot determine root cause from code +
     local repro, **say so explicitly and ask for the missing
     information** (browser console output, server log, repro
     steps). Don't paper over the gap by shipping diagnostic
     infrastructure as the "fix".
4. **For prod-affecting actions, ask first.** `gh workflow run` on
   prod pipelines, `supabase db push`, Vercel deploy hooks: explicit
   confirmation per trigger, never inferred from a previous "yes".
5. **Branches get deleted after merge.** Repo setting
   `delete_branch_on_merge=true` handles remote; locally
   `git fetch -p && git branch -d <branch>` after merge.
   `feat/undo-foundation` is the one exception — paused work, leave alone.
6. **Domain docs stay current.** When a feature changes a domain
   substantially, update the matching `docs/domains/<area>.md` in the
   same PR. Reviewers ask for it.
7. **File naming:** kebab-case for new files (see
   [docs/conventions.md](docs/conventions.md)).
8. **No multiple-choice question UIs.** Don't use `AskUserQuestion`
   with prepared options. If a clarification is genuinely needed,
   ask it in plain prose — one focused question, room for a free-form
   answer. Multiple-choice batches push synthesis back onto the user
   when the work of the agent is to propose, not to enumerate.
9. **No Vercel preview reports.** While babysitting a PR, skip
   `vercel[bot]` PR comments silently — the building / deployed /
   ready transitions are not user-facing signal. Treat them as
   noise. Only surface a Vercel event if it's an explicit failure
   or the user has asked about the preview.

## Quickstart

```bash
# install
npm ci

# dev server
npm run dev

# fast offline gate (lint + typecheck + tests + schema sanity)
npm run gate:ci

# local Supabase (Colima-based; some services excluded for stability)
supabase start --exclude vector,inbucket,realtime,studio
supabase db reset --local        # apply baseline migration

# regenerate types from prod (needs SUPABASE_DB_PASSWORD + access token).
# CI runs this automatically post-deploy — don't hand-edit
# `lib/supabase/database.types.ts` in a PR, it gets overwritten.
npm run types:gen

# verify db schema against prod (needs creds, gates against silent drift)
npm run verify:schema-drift
```

## Where things live (cheat-sheet)

- **User memory** (preferences across sessions):
  `~/.claude/projects/-Volumes-Data-Projects-gruf-io/memory/MEMORY.md`
- **GitHub secrets:** `gh secret list` — DB credentials, Vercel hook,
  Supabase access token live there. Never commit them.
- **Squashed migration baseline:** one file in
  [supabase/migrations/](supabase/migrations/) (currently
  `20260519130800_seed_color_oil_schmincke_norma.sql` is the
  earliest — the squashed baseline lives at the bottom of the
  history, all later migrations stack on top).
- **Plans by Claude:** `~/.claude/plans/` — drafts of larger work
  the user has approved or is reviewing.

## Quirks I've already hit

Lessons learned the hard way during the May 2026 squash + CI
refactor. Save your future self the bruise.

- **Parallel Claude sessions share the same working tree.** If two
  Claude Code sessions run on this repo simultaneously, branch
  switches in one mutate `HEAD` for the other. Files you didn't
  touch will appear as `M` in `git status`. **Mitigation:** never
  `git add -A`; stage explicit paths only. Run `git status` before
  every commit. If you find yourself on someone else's branch, get
  back via `git checkout <my-branch>` and `git stash push --
  <their-files>` for anything not yours.
- **No external path-filter actions.** `dorny/paths-filter@v3` had
  a negation-pattern semantic (`!file`) that matched everything,
  not "everything except". Detection lives in a single composite
  action: [.github/actions/detect-paths/](.github/actions/detect-paths/).
  Both `ci.yml` and `deploy.yml` consume the same `has_frontend`,
  `has_backend`, `has_db`, `has_filter_service`, `has_ci`,
  `has_other` outputs. New path category? Extend the regex in the
  composite action (one place) and update the gates in the
  consuming workflows; don't pull in another action and don't
  re-add inline detect blocks.
- **`actions/checkout@v5` needs `fetch-depth: 0`** in any job that
  diffs against the PR base — the default depth-1 clone has no
  base history.
- **Squash drops the `storage` schema.** `supabase migration squash
  --linked` only dumps `public`. The `storage.objects` RLS DO-block
  must be manually re-appended; see
  [docs/playbooks/squash-migrations.md](docs/playbooks/squash-migrations.md).
- **Never hand-edit `lib/supabase/database.types.ts`.** CI
  regenerates it post-deploy via `npm run types:gen` (see
  `.github/workflows/deploy.yml`). Hand-edits during a migration
  PR (to silence TS errors about new columns) get overwritten on
  the next deploy. The right pattern is: cast at the call site
  (`as any` / explicit `Database["public"]["Tables"][…]`) for the
  PR, let CI fix the types post-merge. Confirmed during the
  iscc_nbs_name + palette_indices_used rollout (#365, #367) where
  hand-edits to types.ts kept getting clobbered.

## When stuck

1. Look at the matching `docs/domains/<area>.md` for entry-points.
2. If unsure which domain, the table above lists primary code paths.
3. For DB / migration questions: [docs/reference/migrations.md](docs/reference/migrations.md)
   is the canonical workflow doc; for the squash recipe specifically,
   [docs/playbooks/squash-migrations.md](docs/playbooks/squash-migrations.md).
4. For CI failure debugging: [docs/ci/README.md](docs/ci/README.md).
