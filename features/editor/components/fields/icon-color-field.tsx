"use client"

/**
 * Editor field: color input with leading swatch.
 *
 * Phase 2 of the form-fields unification (see plan
 * /Users/christian/.claude/plans/form-fields-unification.md).
 * Thin wrapper over the unified <FormField variant="color">.
 *
 * The hex normalisation + commit-on-blur logic that used to live
 * inline here is now in `<FormField variant="color">`, backed by
 * the extracted `lib/forms/normalize-hex` helper. Old `onChange`
 * is the commit callback (called once with normalised hex on
 * Enter / blur, or directly with the picker's value).
 */
import { FormField } from "@/components/ui/form-controls"

export function IconColorField({
  value,
  onChange,
  ariaLabel,
  disabled,
  inputClassName,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  disabled?: boolean
  inputClassName?: string
}) {
  return (
    <FormField
      variant="color"
      label={ariaLabel}
      labelVisuallyHidden
      value={value}
      onCommit={onChange}
      disabled={disabled}
      inputClassName={inputClassName}
    />
  )
}
