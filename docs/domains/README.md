# Domain docs

Per-domain context for both LLMs and humans new to a code area.
The root [CLAUDE.md](../../CLAUDE.md) routes here based on the area
being touched.

## Status legend

- **🚧 planned** — file not yet written; high-priority gap.
- **✓ written** — full domain doc lives in this folder.
- **🔗 link-only** — thin wrapper here that delegates to an existing
  longer doc in `/docs/`.
- **🌱 stub** — placeholder; domain not yet on `main` or in flux.

## Doc inventory

| Status | File | Domain | Routes to |
|---|---|---|---|
| 🚧 | `image-editor.md` | Konva canvas, master/working/asset images, set-active-master flow | [lib/editor/](../../lib/editor/), [services/editor/](../../services/editor/) |
| 🔗 | `image-state.md` | `project_image_state` row binding, `px_u` coordinate system, version chain | [docs/reference/persistence.md](../reference/persistence.md), [docs/specs/image-state-api.mdx](../specs/image-state-api.mdx) |
| 🔗 | `filter-pipeline.md` | Frontend filter forms → API → Python filter-service | [docs/reference/filter-stack-findings.md](../reference/filter-stack-findings.md), [docs/reference/filter-service.md](../reference/filter-service.md) |
| 🔗 | `forms.md` | 24px grid, primitives, draft-reducer pattern | [docs/forms/primitives-inventory.md](../forms/primitives-inventory.md), [docs/forms/decision-tree.md](../forms/decision-tree.md) |
| 🚧 | `api-architecture.md` | Next.js App Router patterns, auth wrapper, jsonError convention, caching | [app/api/](../../app/api/), [docs/reference/api-route-caching-audit.md](../reference/api-route-caching-audit.md) |
| 🚧 | `project-lifecycle.md` | Project create / soft-delete (atomic RPC), generation table, master-image guard | [services/projects/](../../services/projects/), `delete_project` RPC |
| 🔗 | `auth-rls.md` | Owner-only RLS, service-role bypass rules, `auth.uid()` policies | [docs/security/supabase-rls.md](../security/supabase-rls.md), [docs/checklists/rls.md](../checklists/rls.md) |
| 🚧 | `storage.md` | `project_images` bucket, path convention, master/working/filter-working-copy upload flow | [lib/storage/](../../lib/storage/) |
| 🔗 | `database.md` | Migrations workflow, squashed baseline, schema-drift gates | [docs/reference/migrations.md](../reference/migrations.md), [docs/reference/db-review.md](../reference/db-review.md) |
| 🚧 | `testing-strategy.md` | Vitest unit + integration (real local Supabase), Playwright smoke/nightly/visual | [tests/integration/](../../tests/integration/), [e2e/](../../e2e/) |
| 🔗 | `ci-deploy.md` | GitHub Actions workflows, deploy.yml approval gate, Vercel hook | [docs/ci/README.md](../ci/README.md), [docs/checklists/release.md](../checklists/release.md) |
| 🌱 | `undo-history.md` | Currently on branch `feat/undo-foundation`; not yet on main | n/a |

## Per-domain doc structure

All `🚧 → ✓` files follow the same outline so an LLM can scan them
predictably:

```
## Purpose             — 2–3 sentences
## Where it lives      — code paths
## Key concepts        — non-obvious patterns / vocabulary
## Data flow           — sequence or ASCII diagram
## Conventions         — domain-only rules
## Common pitfalls     — things that have already gone wrong
## Cross-references    — related domains + deeper docs
```

Hard cap: **~120 lines per doc.** Long docs don't get read.

## When to update

- New feature changes how a domain works → update the matching doc
  in the same PR.
- Doc is stale and you spot it → fix it; no separate ticket needed.
- Domain hits a level of complexity where the wrapper-style is no
  longer enough → upgrade `🔗` to `✓` (i.e. move from "link to
  existing doc" to "full domain context here").
