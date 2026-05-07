"use client"

/**
 * Editor field: numeric input with leading icon.
 *
 * Phase 2 of the form-fields unification (see plan
 * /Users/christian/.claude/plans/form-fields-unification.md).
 * Thin wrapper over the unified <FormField>.
 *
 * Lifecycle mapping mirrors PanelSizeField:
 *   - old `onValueChange` (every keystroke) → `onDraftChange`
 *   - `onCommit` is a no-op; callers drive save via their own
 *     `onBlur` / `onKeyDown` passed through `numericProps`
 */
import type * as React from "react"

import { FormField } from "@/components/ui/form-controls"
import type { NumericMode } from "@/lib/editor/numeric"

export function IconNumericField({
  value,
  onValueChange,
  ariaLabel,
  disabled,
  icon,
  mode,
  numericProps,
}: {
  value: string
  onValueChange: (next: string) => void
  ariaLabel: string
  disabled?: boolean
  icon: React.ReactNode
  mode: NumericMode
  numericProps?: Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "id"
  >
}) {
  return (
    <FormField
      variant="numeric"
      numericMode={mode}
      label={ariaLabel}
      labelVisuallyHidden
      iconStart={icon}
      value={value}
      onCommit={() => {
        /* no-op — caller drives the save via numericProps.onBlur */
      }}
      onDraftChange={onValueChange}
      inputProps={numericProps}
      disabled={disabled}
    />
  )
}
