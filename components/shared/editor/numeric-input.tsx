"use client"

import React, { forwardRef } from "react"

import { Input } from "@/components/ui/input"
import { sanitizeNumericInput, type NumericMode } from "@/lib/editor/numeric"

type Props = Omit<React.ComponentPropsWithoutRef<typeof Input>, "onChange" | "value" | "inputMode"> & {
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
    <Input
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

