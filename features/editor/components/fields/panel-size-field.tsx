"use client"

/**
 * Shared size/position field for editor panels.
 *
 * Responsibilities:
 * - Provide a consistent numeric input with a leading icon and trailing unit label.
 * - Used by image-panel, artboard-panel, and grid-panel.
 */
import type { KeyboardEventHandler, ReactNode } from "react"

import { FieldGroup, FieldGroupAddon, FieldGroupText } from "@/components/ui/form-controls/field-group"
import type { NumericMode } from "@/lib/editor/numeric"
import { NumericInput } from "../numeric-input"

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
    <FieldGroup>
      <NumericInput
        id={id}
        value={value}
        onValueChange={onValueChange}
        aria-label={ariaLabel}
        disabled={disabled}
        mode={mode}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      <FieldGroupAddon align="inline-start" aria-hidden="true">
        {icon}
      </FieldGroupAddon>
      <FieldGroupAddon align="inline-end" className="pointer-events-none" aria-hidden="true">
        <FieldGroupText>{unit}</FieldGroupText>
      </FieldGroupAddon>
    </FieldGroup>
  )
}
