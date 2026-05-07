"use client"

/**
 * Shared size/position field for editor panels.
 *
 * Phase 2 of the form-fields unification (see plan
 * /Users/christian/.claude/plans/form-fields-unification.md).
 * Now a thin wrapper over the unified <FormField>. Public API is
 * unchanged so callers (artboard, grid, image-size-inputs) continue
 * to compile and behave the same way.
 *
 * Lifecycle mapping:
 *   - old `onValueChange` (every keystroke) → `onDraftChange`
 *   - `onCommit` is a no-op here because callers handle save via
 *     their own `onBlur` / `onKeyDown` (passed through `inputProps`)
 */
import type { KeyboardEventHandler, ReactNode } from "react"

import { FormField } from "@/components/ui/form-controls"
import type { NumericMode } from "@/lib/editor/numeric"

export function PanelSizeField({
  value,
  onValueChange,
  disabled,
  ariaLabel,
  icon,
  unit,
  id,
  mode = "decimal",
  onFocus,
  onKeyDown,
  onBlur,
}: {
  value: string
  onValueChange: (next: string) => void
  disabled?: boolean
  ariaLabel: string
  icon: ReactNode
  unit: string
  id?: string
  mode?: NumericMode
  onFocus?: () => void
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  onBlur?: () => void
}) {
  return (
    <FormField
      variant="numeric"
      numericMode={mode}
      label={ariaLabel}
      labelVisuallyHidden
      iconStart={icon}
      unit={unit}
      value={value}
      onCommit={() => {
        /* no-op — caller drives the save via inputProps.onBlur */
      }}
      onDraftChange={onValueChange}
      inputProps={{ onFocus, onBlur, onKeyDown }}
      disabled={disabled}
      id={id}
    />
  )
}
