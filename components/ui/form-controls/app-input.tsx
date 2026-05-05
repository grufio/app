/**
 * AppInput — compact 24px input for editor panels and dense layouts.
 *
 * Mirrors the structure of the standard `Input` primitive but ships with the
 * 24px / 12px / leading-[24px] / py-0 sizing the editor uses across its
 * sidepanel and toolbar fields.
 */
import * as React from "react"

import { cn } from "@/lib/utils"

function AppInput({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="app-input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-6 w-full min-w-0 rounded-md border bg-transparent px-3 py-0 text-[12px] leading-[24px] shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[12px] file:leading-[24px] file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-purple focus-visible:ring-purple/30 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { AppInput }
