"use client"

/**
 * Editor field: select dropdown with leading icon.
 *
 * Responsibilities:
 * - Provide a compact select control within the shared input-group chrome.
 */
import type * as React from "react"

import { AppSelect, AppSelectContent, AppSelectValue, SelectFieldControl } from "@/components/ui/form-controls"
import { IconInputGroup } from "./icon-input-group"

/**
 * Select (dropdown) field with leading icon, rendered via InputGroup.
 *
 * IMPORTANT: Keep DOM structure aligned with existing usage:
 * IconInputGroup -> Select -> SelectTrigger -> SelectValue -> SelectContent
 */
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
    <IconInputGroup addon={icon} addonAlign="inline-start">
      <AppSelect value={value} onValueChange={onValueChange}>
        <SelectFieldControl
          className={triggerClassName}
          disabled={disabled}
          aria-label={ariaLabel}
          onPointerDownCapture={triggerOnPointerDownCapture}
        >
          <AppSelectValue className="truncate" />
        </SelectFieldControl>
        <AppSelectContent>{children}</AppSelectContent>
      </AppSelect>
    </IconInputGroup>
  )
}

