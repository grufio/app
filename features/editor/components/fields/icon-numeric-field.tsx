"use client"

/**
 * Editor field: numeric input with leading icon.
 *
 * Responsibilities:
 * - Provide a numeric-only input in panel rows with consistent chrome.
 */
import type * as React from "react"

import { NumericInput } from "../numeric-input"
import { IconInputGroup } from "./icon-input-group"

type NumericProps = React.ComponentProps<typeof NumericInput>

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
  mode: NumericProps["mode"]
  numericProps?: Omit<NumericProps, "value" | "onValueChange" | "aria-label" | "disabled" | "mode">
}) {
  return (
    <IconInputGroup addon={icon} addonAlign="inline-start">
      <NumericInput
        value={value}
        onValueChange={onValueChange}
        aria-label={ariaLabel}
        disabled={disabled}
        mode={mode}
        {...numericProps}
      />
    </IconInputGroup>
  )
}

