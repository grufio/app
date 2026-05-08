/**
 * AppInput — compact 24px input for editor panels and dense layouts.
 *
 * Mirrors the structure of the standard `Input` primitive but ships with the
 * 24px / 12px / leading-[24px] / py-0 sizing the editor uses across its
 * sidepanel and toolbar fields.
 *
 * Use the `borderless` prop when embedding the input inside an
 * `AppFieldGroup` — it strips the input's own border/bg/shadow/focus-ring
 * and switches the `data-slot` to `input-group-control` so the group's
 * chrome (focus highlight, invalid state, slot rounding) keeps working.
 */
import * as React from "react"

import { cn } from "@/lib/utils"

const BORDERLESS_CLASSES =
  "flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"

type AppInputProps = React.ComponentProps<"input"> & {
  /** Strip chrome for FieldGroup embedding. See module docstring. */
  borderless?: boolean
}

function AppInput({ className, type, borderless, ...props }: AppInputProps) {
  return (
    <input
      type={type}
      data-slot={borderless ? "input-group-control" : "app-input"}
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input flex h-6 w-full min-w-0 rounded-md border bg-transparent px-3 py-0 text-panel shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-panel file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-purple focus-visible:ring-purple/30 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
        borderless && BORDERLESS_CLASSES,
        className
      )}
      {...props}
    />
  )
}

export { AppInput }
