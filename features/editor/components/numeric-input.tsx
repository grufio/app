"use client"

/**
 * Numeric input helpers for editor panels.
 *
 * Responsibilities:
 * - Provide a controlled input that sanitizes numeric text (int/decimal).
 * - Keep parsing/commit decisions in callers.
 */
import React, { forwardRef } from "react"

import { NumericFieldControl } from "@/components/ui/form-controls"
import { sanitizeNumericInput, type NumericMode } from "@/lib/editor/numeric"

type Props = Omit<React.ComponentPropsWithoutRef<typeof NumericFieldControl>, "onChange" | "value" | "inputMode"> & {
  value: string
  mode?: NumericMode
  onValueChange: (next: string) => void
}

/**
 * Thin wrapper around shadcn `Input` that:
 * - enforces numeric-only text
 * - keeps value as a string (callers decide when/how to parse+commit)
 */
export const NumericInput = forwardRef<HTMLInputElement, Props>(function NumericInput(
  { value, onValueChange, mode = "decimal", ...rest },
  ref
) {
  const inputMode = mode === "int" ? "numeric" : "decimal"

  return (
    <NumericFieldControl
      {...rest}
      ref={ref}
      value={value}
      inputMode={inputMode}
      onChange={(e) => {
        const next = sanitizeNumericInput(e.target.value, mode)
        onValueChange(next)
      }}
    />
  )
})

