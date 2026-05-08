/**
 * Numeric+unit gap helpers for `FormField variant="numeric"`.
 *
 * The 8px gap between a numeric input's right edge and a trailing
 * unit label is split across two elements: the input shrinks its
 * right padding to 8px, the addon zeroes its left padding. This
 * helper centralises both sides so they can't drift apart.
 *
 * The `!` prefix is intentional — it overrides the inherited `px-3`
 * from `AppInput` (input side) and the inherited `px-2` from
 * `InputGroupAddon` (addon side). Without the modifier, `cn()` would
 * keep the larger paddings since neither side knows the variant
 * context.
 */

/**
 * Returns the input-side className for a numeric `FormField` with a
 * trailing unit. Returns `null` when there's no unit so the default
 * input padding wins.
 */
export function numericInputClassWhenUnit(unit: string | undefined): string | null {
  return unit ? "!pr-2" : null
}

/** Addon-side className for a numeric `FormField`'s trailing unit. */
export const numericUnitAddonClass = "pointer-events-none !pl-0"
