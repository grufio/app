# Forms Sizing Tokens — Glossary

> **Status:** 2026-05-08 — Phase 4 wrap of the forms+components review.
> Sized to be *the* place to look up "what does `text-panel` mean again".

The compact-form (24px) family relies on a small set of
typography + spacing tokens that all line up to keep the chrome
visually consistent. Mix them, don't reinvent them.

---

## Typography

| Token | Resolves to | Purpose | Defined in |
|---|---|---|---|
| `text-panel` | `text-[12px] leading-[24px]` | Default text in the 24px-form family. Lines up with `h-6` controls so a label and an input sit on the same baseline. | [globals.css](../app/globals.css#L125) |
| `text-panel-tight` | `text-panel + py-0.5` | Same typography for elements that already sit in their own row (dropdown items, listbox labels). 28px row clears the trigger's 24px height. | [globals.css](../app/globals.css#L130) |

Use `text-panel` on the input/trigger itself; `text-panel-tight` on
the items inside the open dropdown.

---

## Heights

| Token | Pixels | Purpose |
|---|---|---|
| `h-6` | 24px | The single canonical height for the panel-form family. Inputs, selects, buttons, icon buttons all collapse here. |
| `h-8` | 32px | TabsList container in the sidepanel — has to clear the 24px tabs *and* their hover background. Not used for individual inputs. |

Default Forms (shadcn) family uses `h-9` / `h-10`. Don't borrow
across families.

---

## Horizontal padding

| Token | Pixels | Used in |
|---|---|---|
| `px-3` | 12px | Default left+right padding on `AppInput` and `AppSelectTrigger` chrome. |
| `px-2` | 8px | `InputGroupAddon` left+right padding (icon→text gap inside an addon slot). |
| `pr-2` | 8px | Numeric inputs with a trailing unit — overrides default `px-3` so the input's right edge sits 8px from the unit text. See [`numeric-variant-classes.ts`](../lib/forms/numeric-variant-classes.ts). |
| `pr-1` | 4px | `SelectFieldControl` chevron-side override — chevron sits 4px from the cell's right edge. Visible-only inside FieldGroup-embedded selects. |

The numeric+unit gap is split across two elements (input `pr-2`,
addon `!pl-0`) — *don't* try to fix it with a single side. The
gallery test bench (`/dev/form-primitives`, "Resizing test bench"
section) is the regression detector.

---

## Vertical padding

| Token | Pixels | Used in |
|---|---|---|
| `py-0` | 0 | Default vertical padding for `AppInput` / `AppSelectTrigger` (the `h-6` + `leading-[24px]` already centre the text). |
| `py-0.5` | 2px each side (4px total) | `text-panel-tight` — keeps dropdown rows at 28px (24px line + 4px padding). |

---

## State colours

| Surface | Default | Hover | Focus-visible | Disabled | Active |
|---|---|---|---|---|---|
| `AppInput` / `FieldControl` | `border-input` | — | `border-purple` ring | `opacity-50` | n/a |
| `AppSelectTrigger` | `border-input` | — | `border-purple` ring | `opacity-50` | n/a |
| `AppButton` | per-variant | per-variant | `border-purple` ring | `opacity-50` | per-variant |
| `RightPanelIconButton` | per-variant | per-variant | per-variant | per-variant | n/a |
| `TabsSidepanel` trigger | transparent | `bg-zinc-200` (¹) | (default Radix) | no hover | `bg-foreground` / `text-background` |

(¹) `--accent` token is currently `oklch(0.97 0 0)` — too light to be
a visible hover. `bg-zinc-200` is a documented exception until a
proper `--hover-bg` lands. See findings `F2.1`.

---

## Cross-cutting rules

1. **Don't introduce new shade-class hardcodes** (`bg-zinc-*`,
   `text-gray-*`, etc.). Use tokens (`bg-foreground`,
   `bg-accent`, `text-muted-foreground`, `border-input`).
2. **`text-panel` everywhere in the 24px family** — never write
   `text-[12px] leading-[24px]` literally; prefer the token so
   future bumps stay coherent.
3. **Line-heights match heights**. `text-panel`'s 24px line maps to
   `h-6`. If you change one, change the other.
4. **Icon size is locked to `size-4` (16px)** inside addons via
   `[&_svg]:size-4`. Lucide icons drop in without needing per-icon
   sizing.

---

## When you need a new token

If you find yourself writing the same arbitrary-value class twice
(like `text-[12px] leading-[24px] py-0.5` was before
`text-panel-tight`), promote it to a token:

1. Add the utility in [globals.css](../app/globals.css) under
   `@layer utilities`.
2. Replace existing call-sites.
3. Update this doc.
4. Mention it in the next release-notes/PR description so the
   pattern propagates.
