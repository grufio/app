"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { AppSelectTrigger } from "./app-select"

/**
 * Compact select trigger for use inside a FieldGroup.
 *
 * Wraps `AppSelectTrigger` and strips its own border/background/shadow so the
 * surrounding `FieldGroup` provides the chrome and focus state.
 */
export function SelectFieldControl(props: React.ComponentProps<typeof AppSelectTrigger>) {
  const { className, ...rest } = props
  return (
    <AppSelectTrigger
      className={cn(
        "flex-1 min-w-0 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 overflow-hidden whitespace-nowrap",
        className
      )}
      {...rest}
    />
  )
}
