# Docs

Documentation index. The repo's LLM-context entry-point is the
root [CLAUDE.md](../CLAUDE.md); this file is for humans navigating
the docs tree.

## Layout

| Folder | What's in it |
|---|---|
| [domains/](domains/) | LLM-context per domain (image-editor, api-architecture, project-lifecycle, storage, testing-strategy, …). Each doc follows a fixed template (Purpose / Where it lives / Conventions / Cross-references). |
| [reference/](reference/) | Living architecture docs that evolve with the code. Update as features change. |
| [forms/](forms/) | Everything about the form-control primitives + their two-family split (decision tree, sizing tokens, primitives inventory, optimization findings). |
| [archive/](archive/) | Frozen historical reviews. Don't edit; status banners mark each as closed. |
| [checklists/](checklists/) | Operational gates: release flow, RLS verification. |
| [security/](security/) | RLS architecture, lock-guard matrix, function security semantics. |
| [specs/](specs/) | Formal `.mdx` specs with field-level invariants (image-state-api, sizing-invariants, etc.). |
| [qa/](qa/) | Manual QA checklists + the should/is matrix that decides what gets E2E coverage. |
| [ci/](ci/) | GitHub Actions pipeline doc + template. |
| [playbooks/](playbooks/) | End-to-end task recipes ("how do I run the full squash again?"). Captures lessons learned across PRs. |
| [runbooks/](runbooks/) | Operational procedures (rollback, access management, sprint rollouts). |
| [performance/](performance/) | Performance guardrails + caching/auth deep-dive. |

## Top-level files

- [conventions.md](conventions.md) — file-naming, branching, commit
  format, gates, hooks, forms primitives. Most-referenced doc; stays
  at top because nearly every PR touches at least one rule.

## When to add a new doc

1. **A new code domain emerges** → add `domains/<area>.md` with the
   standard template.
2. **A new architecture pattern needs docs** → add to
   `reference/`.
3. **A formal spec to commit to** (input/output contract,
   invariants) → add to `specs/`.
4. **A retrospective/review of a past push** → add to `archive/`
   with a `> Status: closed (YYYY-MM-DD)` banner.
5. **An ops procedure** → `runbooks/`.
6. **A "how do I do X end-to-end again?" recipe** → `playbooks/`.

If unsure, default to `reference/`. It's easier to move a doc
later than to invent a new bucket.

## Naming conventions

- Folder names are lowercase plural (`reviews`-style was rejected
  in favour of `archive` for clarity).
- File names are lowercase kebab-case. Drop redundant prefixes
  when the folder already gives the context (`forms/decision-tree.md`,
  not `forms/forms-decision-tree.md`).
- Dated review docs include the date in the filename
  (`system-review-2026-05-06.md`); status banner inside repeats it.

## Status banners

Dated review files in [archive/](archive/) and active
findings docs (e.g. [reference/filter-stack-findings.md](reference/filter-stack-findings.md))
carry a one-line `> Status:` banner under the H1:

- `✅ closed (YYYY-MM-DD)` — frozen, don't edit
- `⏳ in progress` — actively tracked, link to plan
- `🟡 archived` — partially actioned, see successor

The script `scripts/check-review-status-banner.mjs` enforces this
on dated review files.
