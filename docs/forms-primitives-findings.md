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

### F1.2.a Item/Label sizing uses arbitrary Tailwind values ✓ (Phase 2)
`AppSelectItem` and `AppSelectLabel` previously applied `text-[12px]
leading-[24px] py-0.5`. Now consolidated as the
[`.text-panel-tight`](../app/globals.css) utility (text-panel +
py-0.5 = 28px row).

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

## Phase 2 — Theme tokens + state consistency

### F2.1 Theme-token migration ✓ (this PR)
- Added `.text-panel-tight` utility in
  [`globals.css`](../app/globals.css). Replaces the arbitrary
  `text-[12px] leading-[24px] py-0.5` literal in
  [`app-select.tsx`](../components/ui/form-controls/app-select.tsx)
  for `AppSelectItem` and `AppSelectLabel`.
- `TabsSidepanel`: active-tab colours migrated from `bg-black` /
  `text-white` to `bg-foreground` / `text-background`. Dark mode
  (when added) will flip automatically.
- `TabsSidepanel`: inactive-tab hover stays on `bg-zinc-200`. Reason
  is documented inline: the standard `--accent` token (oklch 0.97)
  is too light to be visible. A future `--hover-bg` token (or a
  bumped `--accent`) would let us migrate this away — explicitly
  out of scope for now since `--accent` is used by other shadcn
  primitives where its current lightness is fine.

### F2.2 State consistency audit
Compact-form primitives state matrix as of this PR:

| Control | hover | focus-visible | disabled | active |
|---|---|---|---|---|
| `AppInput` / `FieldControl` | — | `border-purple` ring | opacity 50% | n/a |
| `AppSelectTrigger` | — | `border-purple` ring | opacity 50% | n/a |
| `AppButton` | per-variant | `border-purple` ring | opacity 50% | per-variant |
| `TabsSidepanel` trigger | `bg-zinc-200` | (default) | no hover | `bg-foreground/text-background` |
| `RightPanelIconButton` | per-variant | per-variant | per-variant | n/a |

**Decision:** no hover on `AppInput` / `AppSelectTrigger` is
intentional — text inputs typically don't need hover affordance and
the select trigger's chevron is enough cue. `TabsSidepanel`'s hover
exists because tabs *are* clickable buttons.

### F2.3 A11y check
- All editor `FormField` consumers pass a `label` prop and use
  `labelVisuallyHidden` for sr-only — verified via grep of
  `<FormField` in `features/editor/`.
- `TabsTrigger`s carry explicit `id` + `aria-controls` for sr nav.
- `disabled` HTML attribute carries through Radix to native button,
  which sets `aria-disabled` automatically.

No A11y gaps found that need code action this round.

## Phase 3 — Coverage + visual regression

### F3.1 Pure-helper extraction ✓ (Phase 1)
12 new tests landed in Phase 1 (`chain-handlers`, `strip-wrapper-keys`,
`numeric-variant-classes`). Coverage moved from 71.81% to 74.27%
functions — well above the 73% gate.

### F3.2 Visual regression for the gallery — placeholder
The dev gallery is now reachable in E2E builds
(`E2E_TEST=1` toggles past the production-`notFound()` gate in
[`page.tsx`](../app/dev/form-primitives/page.tsx)). The visual
regression test lives commented-out in
[`forms.visual.spec.ts`](../e2e/forms.visual.spec.ts) until a
baseline PNG is generated via
`npx playwright test e2e/forms.visual.spec.ts --update-snapshots`.

The reason it's commented rather than `test.skip`'d: skipped tests
still report as warnings in CI, and a warning that's permanent
becomes invisible. A commented stub with a clear TODO is honest:
this is *not* yet covered.

**DoD when ready:**
1. Run snapshot-update locally
2. Commit `form-primitives-gallery.png` in
   `e2e/forms.visual.spec.ts-snapshots/`
3. Uncomment the test
4. Verify CI passes

## Phase 4 — Documentation ✓

- New decision tree: [`forms-decision-tree.md`](forms-decision-tree.md).
  Walks contributors through "default vs custom?" → "FormField vs lower
  primitive?" → "which variant?" with explicit anti-patterns.
- New sizing-token glossary:
  [`forms-sizing-tokens.md`](forms-sizing-tokens.md). Single source of
  truth for `text-panel` / `text-panel-tight` / `h-6` / `px-3` /
  `pr-2` / `pr-1` / state-colour mappings.
- Cross-link comment added to
  [`input-group.tsx`](../components/ui/form-controls/input-group.tsx#L58)
  on the addon `px-2` so future readers find the
  `numeric-variant-classes.ts` override pattern instead of hand-fixing
  the gap from one side.
- Inventory doc's "Quick links" updated to point at the new docs.

---

## Summary table

| Finding | Status | Phase to land in |
|---|---|---|
| F1.1.a Pure helpers extracted | ✓ this PR | — |
| F1.1.b Variant sub-file split | open | future PR (L) |
| F1.1.c Drop unused `focus()` from handle | open | future PR (S) |
| F1.2.a `.text-panel-tight` token | ✓ Phase 2 | — |
| F2.1 TabsSidepanel active → tokens | ✓ Phase 2 | — |
| F2.1 TabsSidepanel hover token | deferred (no good `--hover-bg`) | future |
| F2.2 State consistency | clean (no hover on inputs is intentional) | — |
| F2.3 A11y | no gaps found | — |
| F3.1 Pure-helper extraction | ✓ Phase 1 | — |
| F3.2 Gallery visual regression | reachable in E2E; baseline pending | follow-up |
| F4.1 Decision tree | ✓ Phase 4 | — |
| F4.2 Sizing-token glossary | ✓ Phase 4 | — |
| F1.3.b Cross-link addon padding comment | ✓ Phase 4 | — |
| F1.3.a Merge field-group.tsx | open | future PR (XS) |
| F1.2.b Keep two-layer trigger | decided | — |
| F1.3.a Merge field-group.tsx into input-group.tsx | open | Phase 4 |
| F1.3.b Cross-link addon padding comment | open | Phase 4 |
| F1.4 app-button | clean | — |
| F1.5.a Merge `FieldControl` into `AppInput` | open | future PR (S) |
| F1.5.b Inline color-swatch-control | decided | — |
