# Forms Decision Tree

> **Status:** 2026-05-08 — written as part of the Phase 4 wrap of the
> forms+components review. If you're adding a new form-like surface to
> the codebase, walk this tree first.

This is the *which primitive should I reach for* doc. Companion docs:

- [`forms-review.md`](forms-review.md) — *why* there are two families
  of form primitives (default vs panel) at all.
- [`forms-primitives-inventory.md`](forms-primitives-inventory.md) —
  *what* primitives exist today, with consumer counts and coverage.
- [`forms-primitives-findings.md`](forms-primitives-findings.md) —
  *what we found and what to refactor next*.

---

## Step 1 — Which family?

Where will the form *live*?

```
Is the surface inside the editor's right or left panel,
the canvas-tool sidebar, or a filter form dialog?

  YES → Custom Forms (24px)            → components/ui/form-controls/
  NO  → Default Forms (shadcn 36-40px) → components/ui/
```

Examples:
- Login / signup → **Default**
- "Create project" dialog → **Default**
- Restore / Delete confirms → **Default**
- Editor right-panel (Image / Artboard / Grid) → **Custom**
- Filter dialogs (Pixelate / Line Art / Numerate) → **Custom**

The two families *do not mix on the same surface*. Don't put a 24px
control next to a 36px Default-Forms control — pick one and keep it.

---

## Step 2 — Inside Custom Forms, which composer?

```
Need draft+commit lifecycle (commit on blur/Enter, revert on Escape)?

  YES → FormField (variant: numeric / text / color / select)
  NO  → reach for the lower-level primitive directly:
        - AppInput            → free-form text without lifecycle
        - AppFieldGroup       → custom layout (icon prefix, etc.)
        - AppSelect           → standalone dropdown
        - AppButton           → all sizes; no draft notion
```

`FormField` is the right answer ~95% of the time. Reach lower only
when you have a deliberate reason — e.g. a one-shot button, a
read-only label, or a row that mixes a non-input control with
form-styled chrome.

---

## Step 3 — `FormField` variant cheat sheet

| Variant | Use when | Notes |
|---|---|---|
| `numeric` | A number, with optional unit (mm / cm / pt / %) | Numeric mode: `int` / `decimal` / `signedDecimal`. `unit` prop adds a trailing inline-end addon with the canonical 8px gap. |
| `text` | Free-form text | `description` prop renders muted helper text below. |
| `color` | A hex colour | Renders a swatch + a hex text input that round-trips through `normalizeHex`. |
| `select` | A dropdown with ≤10 options | Trigger displays the active option's `label` (not via Radix portal — the portal flickers on parent re-renders). |

For variants that need an icon prefix, set `iconStart`. The icon
overlays the input's left padding so the visual gap to text matches
the docs example.

---

## Step 4 — When to drop down to the primitives

| Need | Use |
|---|---|
| Pure visual chrome around a non-input control | `AppFieldGroup` + `AppFieldGroupAddon` |
| Right-panel icon button (24×24, ghost-style) | `RightPanelIconButton` (in `features/editor/components/right-panel-controls.tsx`) |
| 2-column field row with optional icon slot | `PanelTwoFieldRow` + `PanelIconSlot` (in `features/editor/components/panel-layout.tsx`) |
| Standalone numeric input without `useFieldDraft` | `AppInput` |
| Standalone select without `useFieldDraft` | `AppSelect` + `AppSelectTrigger` + `AppSelectValue` + `AppSelectContent` |

---

## Step 5 — Don't write these from scratch

Common temptations and the right answer:

- **"I need a numeric input with a unit suffix"** → `FormField variant="numeric" unit="mm"`. The 8px gap saga is solved; don't redo it.
- **"I need a tab strip in the editor"** → use `TabsSidepanel` if it's the left-panel category strip; for arbitrary tabs use `Tabs` from `components/ui/tabs.tsx` with editor-panel styling.
- **"I need a confirmation modal"** → use shadcn's `Dialog` (Default Forms family) with `AppButton variant="destructive"` for the destructive action.
- **"I want hover affordance on a panel button"** → `AppButton` already has it per-variant. Don't write `hover:bg-...` from scratch. The exception is `TabsSidepanel`'s tab strip, which uses `bg-zinc-200` because no theme token currently fits — this is documented inline.

---

## Anti-patterns

- ❌ Mixing 24px and 36px controls on the same row.
- ❌ Hardcoding `text-[12px] leading-[24px]` — use `text-panel`.
- ❌ Hardcoding `bg-zinc-*` / `text-gray-*` shades. Stick to tokens (`bg-foreground`, `bg-accent`, `text-muted-foreground`, etc.). `TabsSidepanel`'s `bg-zinc-200` is the documented exception, not a precedent.
- ❌ Re-implementing the draft+commit lifecycle. `useFieldDraft` already handles focus/blur/Enter/Escape correctly; building parallel state machines invites the bugs `forms-optimizations.md` describes.
- ❌ Adding a `disabled` state without testing keyboard tab-skip. Browsers handle `aria-disabled` automatically when the HTML attribute is set; don't pass `aria-disabled={true}` and `disabled={false}`.
