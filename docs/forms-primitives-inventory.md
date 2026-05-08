# Form Primitives Inventory

> **Status:** 2026-05-08 — initial snapshot for the forms+components review.
> Sister-doc to [`forms-review.md`](forms-review.md) (the two-family split)
> and [`forms-optimizations.md`](forms-optimizations.md) (perf history).
> This doc is the *what we have today* baseline; refactor decisions live
> in `/Users/christian/.claude/plans/forms-components-review.md`.

## Custom Form Primitives — `components/ui/form-controls/`

These power the **24px-style editor panel forms**. For the
shadcn-default family used elsewhere see [`forms-review.md`](forms-review.md).

| Primitive | File | Purpose | Tokens (theme-conform) | Func coverage | Notes |
|---|---|---|---|---|---|
| `FormField` | [form-field.tsx](../components/ui/form-controls/form-field.tsx) | Composite — `numeric` / `text` / `color` / `select` variants on top of the lower primitives + `useFieldDraft` lifecycle | ✓ | 0/6 | Most-used entry point. Imperative handle (`commit/cancelPendingCommit/focus`) used by image-size lock-toggle. Numeric+unit special-case (`!pr-2` + addon `!pl-0`) lives inline. |
| `AppInput` | [app-input.tsx](../components/ui/form-controls/app-input.tsx) | 24px text input — `h-6`, `text-panel`, `px-3`, `py-0`. Optional `borderless` prop strips chrome + sets `data-slot="input-group-control"` for FieldGroup embedding. | ✓ | 0/1 | Used directly when `FormField` doesn't fit (rare); used internally by `FormField` numeric/text/color variants via `borderless`. |
| `AppFieldGroup` + `Addon` + `Text` | [input-group.tsx](../components/ui/form-controls/input-group.tsx) | Border + focus chrome wrapper for input groups (icon + input + addon). Co-located with the bare `InputGroup*` primitives. | ✓ | (rolled up below) | Merged into `input-group.tsx` in the autonomous follow-up — was previously a separate `field-group.tsx`. |
| `InputGroup*` | [input-group.tsx](../components/ui/form-controls/input-group.tsx) | Layout-only flex row with addon slots (`block-start` / `inline-start` / etc.) | ✓ (`px-2` baked in) | 0/3 | Owner of the `px-2` addon padding that interacted with the F1.5 8px-gap saga. |
| `AppSelect` (re-export) | [app-select.tsx](../components/ui/form-controls/app-select.tsx) | Re-exports radix `Select` building blocks | ✓ | — | Pure re-export. |
| `AppSelectTrigger` | [app-select.tsx](../components/ui/form-controls/app-select.tsx) | 24px select trigger — `h-6`, `text-panel`, with `ChevronDown` indicator | ✓ | (in 0/3 above) | Used standalone when no FieldGroup. Trigger pad: `px-3` (still — `SelectFieldControl` overrides to `pr-1` for embedded use). |
| `AppSelectItem` | [app-select.tsx](../components/ui/form-controls/app-select.tsx) | Dropdown item with explicit 12px / 24px line / `py-0.5` to match the trigger | ✓ (arbitrary `text-[12px]`) | (in 0/3 above) | Was a plain re-export until 2026-05-08 — items inherited shadcn's `text-sm py-1.5`. Now an actual component. **Sizing uses arbitrary Tailwind values, not a token.** |
| `AppSelectLabel` | [app-select.tsx](../components/ui/form-controls/app-select.tsx) | Group-label twin of `AppSelectItem` | ✓ (arbitrary) | (in 0/3 above) | Same arbitrary-value note as `AppSelectItem`. |
| `SelectFieldControl` | [select-field-control.tsx](../components/ui/form-controls/select-field-control.tsx) | `AppSelectTrigger` variant with border/bg stripped for FieldGroup embedding (also `pr-1` for tight chevron) | ✓ | 0/1 | The "embedded" twin of `AppSelectTrigger` — analogous to `<AppInput borderless>` for inputs. |
| `ColorSwatchControl` | [color-swatch-control.tsx](../components/ui/form-controls/color-swatch-control.tsx) | Native `<input type="color">` styled to fit a `FieldGroup` | ✓ | 0/1 | Used only via `FormField variant="color"`. Could be inlined. |
| `AppButton` | [app-button.tsx](../components/ui/form-controls/app-button.tsx) | 24px-style button with variants (default/destructive/outline/ghost) and sizes | ✓ | 0/1 | All sizes are `h-6` per `forms-review.md`. Most mature primitive — no known issues. |

### Lifecycle / logic helpers (not in `form-controls/`)

| Helper | File | Purpose | Coverage |
|---|---|---|---|
| `useFieldDraft` | [lib/forms/use-field-draft.ts](../lib/forms/use-field-draft.ts) | React hook around the draft+commit lifecycle reducer; provides `inputProps` (focus/blur/keyDown) and imperative methods | 0/3 (renderer-side) |
| `field-draft-reducer` | [lib/forms/field-draft-reducer.ts](../lib/forms/field-draft-reducer.ts) | Pure reducer that produces effects (`commit`, `draftChange`); the hook fires effects against React refs | 100% (2/2) ✓ |
| `normalizeHex` | [lib/forms/normalize-hex.ts](../lib/forms/normalize-hex.ts) | Hex string parser used by the color variant | covered |
| `sanitizeNumericInput` | [lib/editor/numeric.ts](../lib/editor/numeric.ts) | Per-keystroke filter for the numeric variant (signed/decimal/int) | 100% ✓ |

### Nearby editor-only wrappers (not part of `form-controls/`)

These live in `features/editor/components/` and stack on top of the
primitives. Listed for consumer-mapping context, not as primitives
themselves.

- `right-panel-controls.tsx` — `RightPanelIconButton` (icon-only h-6 button) + `RightPanelToggleIconButton` (active-state variant)
- `panel-layout.tsx` — `PanelTwoFieldRow`, `PanelIconSlot` (`grid-cols-[1fr_1fr_auto]` rows)
- `numeric-input.tsx` — pre-FormField numeric helper, partially superseded by `FormField`

---

## Consumers (14 files import from `@/components/ui/form-controls`)

Editor right-panel:
- `ProjectEditorRightPanel.tsx`
- `artboard-panel.tsx`, `grid-panel.tsx`
- `image-panel/image-position-inputs.tsx`, `image-panel/image-size-inputs.tsx`
- `right-panel-controls.tsx`

Editor toolbars / nav:
- `canvas-tool-sidebar.tsx`, `toolbar-icon-button.tsx`
- `project-title-editor.tsx`

Filter dialogs:
- `filter-forms/filter-form-footer.tsx`
- `lineart-form.tsx`, `numerate-form.tsx`, `pixelate-form.tsx`

Other editor:
- `numeric-input.tsx` (legacy helper)

---

## Theme-token conformity

**Form-controls layer:** clean. No hardcoded `bg-zinc-*`, `text-gray-*`,
or similar shade-classes. Everything uses CSS-variable tokens
(`bg-transparent`, `text-foreground`, `border-input`,
`focus-visible:border-purple`).

**One offender outside the layer:**
[`TabsSidepanel.tsx`](../features/editor/components/TabsSidepanel.tsx)
uses `hover:bg-zinc-200` and `data-[state=active]:bg-black` /
`text-white`. Hardcoded as fallback for the missing
"slightly-darker-than-background" hover token. To be replaced with a
proper token once we add a `--hover-bg` (or use `--accent` if it gets
strengthened) — see plan F2.1.

**Sizing tokens:**
- `text-panel` (12px / 24px line) — defined in
  [globals.css](../app/globals.css#L125)
- `h-6` (24px height) — Tailwind utility, used as the panel-form
  height standard (matches `text-panel`'s 24px line)
- `px-3` (12px) — input/trigger horizontal padding
- `px-2` (8px) — addon horizontal padding (lives in `InputGroupAddon`)

The `text-panel` token is referenced 4× in `form-controls/`. Numeric
addon item-sizing in `app-select.tsx` uses arbitrary `text-[12px]
leading-[24px]` instead — see plan F1.2 (token candidate
`text-panel-tight` or similar).

---

## Test coverage gaps

| File | Func cov | Why no tests |
|---|---|---|
| `form-field.tsx` | 0/6 | Renderer logic; no React testing setup |
| `app-select.tsx` | 0/3 | Renderer logic |
| `input-group.tsx` | 0/3 | Renderer logic |
| `app-button.tsx` | 0/1 | Renderer logic |
| `app-input.tsx` | 0/1 | Renderer logic |
| `select-field-control.tsx` | 0/1 | Renderer logic |
| `color-swatch-control.tsx` | 0/1 | Renderer logic |

Pure logic *is* well-tested — `field-draft-reducer.ts` (100%),
`normalize-hex.ts` (covered), `sanitize-numeric-input.ts` (100%). The
renderer-side gap exists because we don't run React component tests.
Plan F3.1 proposes extracting the few pure helpers still inside the
TSX files (chainHandlers, stripWrapperKeys, variant-conditional class
strings) to bring the gap down to "purely rendering, untested by
design".

---

## Quick links

- **Plan:** `/Users/christian/.claude/plans/forms-components-review.md`
- **Demo page (dev only):** [/dev/form-primitives](http://localhost:3000/dev/form-primitives) — 404s in production
- **Decision tree:** [forms-decision-tree.md](forms-decision-tree.md) — which primitive to reach for
- **Sizing tokens:** [forms-sizing-tokens.md](forms-sizing-tokens.md) — `text-panel`, `h-6`, etc.
- **Findings:** [forms-primitives-findings.md](forms-primitives-findings.md) — refactor backlog
- **Two-family rationale:** [forms-review.md](forms-review.md)
- **Performance history:** [forms-optimizations.md](forms-optimizations.md)
