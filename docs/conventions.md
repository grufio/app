# Conventions

## File naming

The codebase mixes `kebab-case.tsx` (shadcn / Next default) with
`PascalCase.tsx` for some long-lived containers. To stop the drift,
the rule from now on is:

### kebab-case (preferred)

Use kebab-case for **new files** that:

- Live in `lib/`, `services/`, `app/api/**/route.ts`, `e2e/`, `scripts/`.
- Are atomic UI primitives in `components/ui/` or `features/**/components/`.
- Are hooks (`use-*.ts`), utilities, types-only modules.

Examples (already in tree):
- [filter-form-footer.tsx](features/editor/components/filter-forms/filter-form-footer.tsx)
- [image-position-inputs.tsx](features/editor/components/image-panel/image-position-inputs.tsx)
- [right-panel-controls.tsx](features/editor/components/right-panel-controls.tsx)

### PascalCase (allowed for top-level containers)

Existing PascalCase files are kept where they:

- Are a top-level container component whose default export name maps 1:1
  to the file name (`ProjectEditorStage.tsx` → `<ProjectEditorStage />`).
- Have many incoming imports — the cost of a rename outweighs the
  consistency benefit until a planned restructure.

Examples (kept):
- `components/navigation/AppSidebarMain.tsx`
- `components/navigation/SidebarFrame.tsx`
- `features/editor/components/ProjectEditorStage.tsx`
- `features/editor/components/ProjectEditorRightPanel.tsx`

### Don't

- Don't introduce new PascalCase files except when extending an
  existing PascalCase container in the same directory.
- Don't rename PascalCase → kebab-case in unrelated PRs. If you need
  to migrate a PascalCase file as part of a feature, bundle the rename
  into a separate prep commit so the diff is reviewable.

## Branching

Branch prefixes (matched against the recent history):

| Prefix     | Use for                                  |
|------------|------------------------------------------|
| `feat/`    | new user-visible features                |
| `bug/`     | regression fixes that map to a reported issue |
| `fix/`     | non-regression bug fixes                 |
| `refactor/`| internal restructuring, no behaviour change |
| `perf/`    | measurable perf improvements             |
| `chore/`   | tooling, deps, gates, configs            |
| `test/`    | new test coverage / fixtures             |
| `docs/`    | docs-only PRs                            |

## Commits

Conventional Commits style:

```
<type>(<scope>): <summary>

<body — why this change, non-obvious mechanics, surprising edge cases>

Co-Authored-By: <agent if applicable>
```

`type` matches the branch prefix where possible (`feat`/`bug`/`fix`/
`refactor`/`perf`/`chore`/`test`/`docs`).

## Gates

Three pipelines (see [package.json](package.json) — `gate:*`):

- `gate:local` — runs on every dev cycle. lint + typecheck + unit
  tests + verify-rls + verify-service-role-usage. Fast.
- `gate:ci` — gate:local + types-with-migrations + coverage.
- `gate:pre-release` — gate:ci + remote RLS / migrations + visual
  regression. Run before tagging a release.

`gate:linked` exists for local runs that have a linked Supabase
project; it adds the live types-sync check.
