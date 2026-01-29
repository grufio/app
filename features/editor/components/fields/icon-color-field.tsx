"use client"

/**
 * Editor field: color input with leading icon.
 *
 * Responsibilities:
 * - Wrap a native `<input type=\"color\">` in the shared icon/input-group chrome.
 */
import type * as React from "react"

import { InputGroupInput } from "@/components/ui/input-group"
import { IconInputGroup } from "./icon-input-group"

/**
 * Color field with leading icon, rendered via InputGroup.
 * Note: keeps native <input type="color"> behavior (no styling hacks here).
 */
export function IconColorField({
  value,
  onChange,
  ariaLabel,
  disabled,
  icon,
  inputClassName,
}: {
  value: string
  onChange: (next: string) => void
  ariaLabel: string
  disabled?: boolean
  icon: React.ReactNode
  inputClassName?: string
}) {
  return (
    <IconInputGroup addon={icon} addonAlign="inline-start">
      <InputGroupInput
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        disabled={disabled}
        className={inputClassName}
      />
    </IconInputGroup>
  )
}

