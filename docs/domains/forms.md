# Forms

## Purpose

Two form-control families coexist: **shadcn defaults** for login/
dialogs/public UI and **AppForm primitives** (`components/ui/form-controls/`,
24 px grid) for the dense editor panels. The split is intentional —
they shouldn't share styles or behaviour. `<FormField>` is the only
entry point; four variants (numeric/text/color/select) cover every
case in the codebase today.

## Where it lives

- [components/ui/form-controls/](../../components/ui/form-controls/)
  — AppForm primitives: `<FormField>` + the four variants, plus
  `<AppButton>`, `<AppInput>`, etc.
- [lib/forms/](../../lib/forms/) — pure logic: `field-draft-reducer.ts`
  (commit/cancel/escape semantics), `chain-handlers.ts`,
  `normalize-hex.ts`, `numeric-variant-classes.ts`.
- [features/editor/components/](../../features/editor/components/)
  — actual usages in the editor panel.
- App-wide convention block in [docs/conventions.md](../conventions.md)
  (the Forms section pinned post-Phase-4 review).

## Quick orientation

For "what primitive should I use", go to the decision tree. For
"what's actually here", inventory. For "what's broken / planned",
findings. For "two-family split rationale", review.

## Cross-references

- **Decision tree (which primitive to use):**
  [docs/forms/decision-tree.md](../forms/decision-tree.md)
- **Inventory of every primitive:**
  [docs/forms/primitives-inventory.md](../forms/primitives-inventory.md)
- **Open backlog + findings:**
  [docs/forms/primitives-findings.md](../forms/primitives-findings.md)
- **Sizing tokens (24 px / `text-panel` / `h-6`):**
  [docs/forms/sizing-tokens.md](../forms/sizing-tokens.md)
- **Two-family rationale:**
  [docs/forms/review.md](../forms/review.md)
- **Optimization history:**
  [docs/forms/optimizations.md](../forms/optimizations.md)
