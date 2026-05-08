# Form Primitives Review — Findings (Phase 1)

> **Status:** 2026-05-08 — file-level review of `components/ui/form-controls/`.
> Sister-doc to [`forms-primitives-inventory.md`](forms-primitives-inventory.md)
> (the *what we have* baseline). This file is *what we found, and what
> to do about it*.

Each finding has a **DoD** (definition of done — the smallest concrete
change that resolves it) and a **Size** estimate. Items already
addressed in this PR are marked ✓.

---

## F1.1 — `form-field.tsx`

### F1.1.a Pure helpers extracted out of the renderer ✓
- `chainHandlers` → `lib/forms/chain-handlers.ts` (+ tests, 5 cases)
- `stripWrapperKeys` → `lib/forms/strip-wrapper-keys.ts` (+ tests, 4 cases)
- `numericInputClassWhenUnit` + `numericUnitAddonClass` →
  `lib/forms/numeric-variant-classes.ts` (+ tests, 3 cases)

**Why:** the F1.5 8px-gap saga split the gap across two elements
(input `!pr-2`, addon `!pl-0`). With the contract centralised in one
file, future "let me just bump that padding" edits can't accidentally
break only one half.

### F1.1.b Variant split into sub-files
Today: 4 variants (numeric/text/color/select) live in one ~480-LOC
file with 3 internal `forwardRef` components and shared types at the
top.

**DoD:** `components/ui/form-controls/form-field/{numeric.tsx,
color.tsx, select.tsx, types.ts}` plus a thin `form-field.tsx` that
owns the variant union and dispatches.

**Size:** L (~3-4 h). Touches imports across 14 consumers, but the
re-exports stay stable so callers don't change.

**Not done in this PR** — would balloon the diff and the helper
extraction (F1.1.a) addresses the highest-friction part already.

### F1.1.c Imperative-handle audit
`FormFieldHandle` exposes `commit`, `cancelPendingCommit`, `focus`.
Consumers using each:
- `commit()` — `image-size-inputs.tsx` (lock-toggle pre-commit).
- `cancelPendingCommit()` — same call-site (suppress blur-commit when
  lock-button stole focus).
- `focus()` — none found via grep.

**DoD:** drop `focus` from the imperative handle; the underlying
input already accepts a ref through normal React conventions if a
caller really needs it.

**Size:** S (~10 min). Requires checking that nothing transitive
imports it via `FormFieldHandle`. Not done in this PR — pure
reduction, low priority.

---

## F1.2 — `app-select.tsx` + `select-field-control.tsx`

### F1.2.a Item/Label sizing uses arbitrary Tailwind values
`AppSelectItem` and `AppSelectLabel` apply `text-[12px]
leading-[24px] py-0.5`. The intent is "match the trigger's
`.text-panel`". A new utility token (e.g. `.text-panel-tight` =
`text-panel py-0.5`) would centralise this.

**DoD:** define `.text-panel-tight` in
[`globals.css`](../app/globals.css#L124), replace the arbitrary
classes in `app-select.tsx`. Demo page proves the height stays at
28px.

**Size:** S (~20 min). **Belongs in Phase 2 (token migration).**

### F1.2.b Two-layer trigger: `AppSelectTrigger` vs `SelectFieldControl`
Today: `AppSelectTrigger` is the standalone 24px trigger;
`SelectFieldControl` strips its border/bg/shadow for embedding inside
a `FieldGroup` + tightens its right-padding to `pr-1`. Both layers
exist in parallel.

**Decision:** keep both. The "embedded" variant has a different
contract (no chrome, must inherit from the FieldGroup) so a single
component with a `borderless` prop would just push the conditional
into the trigger anyway. The two-file split is honest about the
chrome-vs-no-chrome distinction.

**DoD:** none — review concluded.

---

## F1.3 — `input-group.tsx` + `field-group.tsx`

### F1.3.a Layer responsibility
- `input-group.tsx` — pure layout (flex row + addon slots, `px-2` on
  addons, `[&_svg]:size-4` icon sizing).
- `field-group.tsx` — re-exports `InputGroup*` as `AppFieldGroup*`
  plus a `text-panel`-sized text helper.

`field-group.tsx` is 90% re-export. The renames have a meaning
(`AppFieldGroup` is the editor-panel-flavoured wrapper), but the
indirection costs an extra file to grep through.

**DoD:** merge `field-group.tsx` into `input-group.tsx`, export both
the raw `InputGroup*` names AND the `AppFieldGroup*` aliases from one
file. Consumers continue importing `AppFieldGroup` from
`@/components/ui/form-controls` (the index re-export is unchanged).

**Size:** XS (~10 min, no API surface change).

**Not done in this PR** — saving for Phase 4 cleanup along with the
other small touches.

### F1.3.b Addon padding interacts with input padding
The addon's `px-2` (8px) plus the input's default `px-3` (12px) added
up to a 20px gap text→unit, which is what F1.5 chased down. The
numeric+unit-classes helper now formalises the override; remaining
risk is that *another* variant in the future hits the same trap.

**DoD:** add a comment in `input-group.tsx` near the `px-2` constant
linking to `numeric-variant-classes.ts` so future readers understand
the override pattern.

**Size:** XS (~5 min).

**Not done in this PR.**

---

## F1.4 — `app-button.tsx`

Most mature primitive. Variants (`default` / `outline` / `ghost` /
`destructive` / `secondary`) and sizes (all collapse to `h-6 px-3`
plus icon variants) match what's actually used. No findings.

**DoD:** none.

---

## F1.5 — `field-control.tsx` + `color-swatch-control.tsx` + `app-input.tsx`

### F1.5.a `field-control.tsx` is a borderless `AppInput` clone
Both files reach the same end state (an `<input>` styled to fit a
FieldGroup) by different paths. `FieldControl` strips chrome from
shadcn's base `Input`; `AppInput` is the standalone 24px-style input.

**DoD:** make `AppInput` accept a `borderless` prop (or detect that
it's nested inside a `FieldGroup` via context) and delete
`field-control.tsx`.

**Size:** S (~30 min). Touches `form-field.tsx` (uses `FieldControl`
internally) and `app-select.tsx` indirectly (via `SelectFieldControl`
which uses `AppSelectTrigger`).

**Not done in this PR** — touches more consumers; keep for a
dedicated cleanup PR.

### F1.5.b `color-swatch-control.tsx` only used inside FormField
Used exclusively by `FormField variant="color"`. Could be inlined.

**Decision:** keep as-is. The native `<input type="color">` styling
is fiddly enough to deserve its own file; inlining would obscure
`form-field.tsx`.

**DoD:** none.

---

## Out of Scope for Phase 1

- Token migration (`bg-zinc-200` etc.) → **Phase 2**
- Visual regression tests → **Phase 3**
- Doc updates / decision tree → **Phase 4**
- Disabled/hover/focus consistency audit → **Phase 2**

---

## Summary table

| Finding | Status | Phase to land in |
|---|---|---|
| F1.1.a Pure helpers extracted | ✓ this PR | — |
| F1.1.b Variant sub-file split | open | future PR (L) |
| F1.1.c Drop unused `focus()` from handle | open | future PR (S) |
| F1.2.a `.text-panel-tight` token | open | Phase 2 |
| F1.2.b Keep two-layer trigger | decided | — |
| F1.3.a Merge field-group.tsx into input-group.tsx | open | Phase 4 |
| F1.3.b Cross-link addon padding comment | open | Phase 4 |
| F1.4 app-button | clean | — |
| F1.5.a Merge `FieldControl` into `AppInput` | open | future PR (S) |
| F1.5.b Inline color-swatch-control | decided | — |
