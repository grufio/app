"use client"

/**
 * Editor field: select dropdown with leading icon.
 *
 * Responsibilities:
 * - Provide a compact select control within the shared input-group chrome.
 */
import type * as React from "react"

import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select"
import { IconInputGroup } from "@/components/shared/editor/fields/icon-input-group"

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
  triggerClassName = "flex-1 min-w-0 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 overflow-hidden whitespace-nowrap",
  triggerOnPointerDownCapture,
  children,
}: {
  value: string
  onValueChange: (next: string) => void
  ariaLabel: string
  disabled?: boolean
  icon: React.ReactNode
  triggerClassName?: string
  triggerOnPointerDownCapture?: React.ComponentProps<typeof SelectTrigger>["onPointerDownCapture"]
  children: React.ReactNode
}) {
  return (
    <IconInputGroup addon={icon} addonAlign="inline-start">
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          className={triggerClassName}
          disabled={disabled}
          aria-label={ariaLabel}
          onPointerDownCapture={triggerOnPointerDownCapture}
        >
          <SelectValue className="truncate" />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </IconInputGroup>
  )
}

