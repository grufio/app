"use client"

/**
 * Editor field: select dropdown with leading icon.
 *
 * Phase 2 of the form-fields unification (see plan
 * /Users/christian/.claude/plans/form-fields-unification.md).
 * Thin wrapper over the unified <FormField variant="select">.
 */
import type * as React from "react"

import { FormField } from "@/components/ui/form-controls"
import type { SelectFieldControl } from "@/components/ui/form-controls/select-field-control"

export function IconSelectField({
  value,
  onValueChange,
  ariaLabel,
  disabled,
  icon,
  triggerClassName,
  triggerOnPointerDownCapture,
  children,
}: {
  value: string
  onValueChange: (next: string) => void
  ariaLabel: string
  disabled?: boolean
  icon: React.ReactNode
  triggerClassName?: string
  triggerOnPointerDownCapture?: React.ComponentProps<typeof SelectFieldControl>["onPointerDownCapture"]
  children: React.ReactNode
}) {
  return (
    <FormField
      variant="select"
      label={ariaLabel}
      labelVisuallyHidden
      iconStart={icon}
      value={value}
      onCommit={onValueChange}
      disabled={disabled}
      inputClassName={triggerClassName}
      triggerOnPointerDownCapture={triggerOnPointerDownCapture}
    >
      {children}
    </FormField>
  )
}
