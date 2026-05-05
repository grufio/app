"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { AppInput } from "./app-input"

/**
 * Compact input control for use inside a FieldGroup.
 *
 * Wraps `AppInput` and strips its own border/background/shadow so the
 * surrounding `FieldGroup` provides the visible chrome and focus state.
 * Keep `px-3` from AppInput intact — `FieldGroupAddon` relies on it for the
 * `-mr-3` overlap trick that lets the leading icon sit inside the padding.
 */
export const FieldControl = React.forwardRef<
  React.ElementRef<typeof AppInput>,
  React.ComponentPropsWithoutRef<typeof AppInput>
>(function FieldControl({ className, ...rest }, ref) {
  return (
    <AppInput
      data-slot="input-group-control"
      ref={ref}
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0",
        className
      )}
      {...rest}
    />
  )
})
