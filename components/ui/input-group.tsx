"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * InputGroup
 *
 * Structure + focus pattern based on shadcn/ui docs:
 * https://ui.shadcn.com/docs/components/input-group
 */

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        // Layout
        "flex w-full min-w-0 items-stretch",
        // Chrome (match Input tokens)
        "dark:bg-input/30 border-input bg-transparent rounded-md border shadow-xs transition-[color,box-shadow] outline-none",
        "hover:border-muted-foreground/30",
        // Focus handling via the control slot
        "has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=select-trigger]:focus-visible]:border-ring",
        "has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
        "has-[[data-slot=select-trigger]:focus-visible]:ring-[3px] has-[[data-slot=select-trigger]:focus-visible]:ring-ring/50",
        // Invalid
        "has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive has-[[data-slot=select-trigger][aria-invalid=true]]:border-destructive",
        // Ensure inner controls don't create double-rounded corners
        "[&>[data-slot=input-group-control]]:rounded-none",
        "[&>[data-slot=input-group-addon]]:rounded-none",
        "[&>[data-slot=input-group-button]]:rounded-none",
        "[&>[data-slot=select-trigger]]:rounded-none",
        className
      )}
      {...props}
    />
  )
}

type AddonAlign = "block-start" | "block-end" | "inline-start" | "inline-end"

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & { align?: AddonAlign }) {
  return (
    <div
      data-slot="input-group-addon"
      className={cn(
        "flex shrink-0 items-center gap-2 text-muted-foreground",
        // Align semantics from docs
        align === "block-start" ? "items-start" : null,
        align === "block-end" ? "items-end" : null,
        // Keep addon AFTER the control in the DOM (keyboard focus), but allow visual placement.
        // - inline-start: prefix (left)
        // - inline-end: suffix (right)
        // Pull the input's left padding under the prefix so icon↔text gap matches the docs examples.
        // (Input keeps px-3; addon overlays into that space.)
        align === "inline-start" ? "order-first -mr-3" : null,
        align === "inline-end" ? "order-last ml-auto" : null,
        // Padding
        "px-2",
        // Icon sizing
        "[&_svg]:size-4",
        className
      )}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="input-group-text" className={cn("text-xs", className)} {...props} />
}

function InputGroupInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    // IMPORTANT: This is copied verbatim from the shadcn InputGroup example output.
    // Do not "simplify" or "refactor" this — the goal is identical DOM/class output.
    <input
      data-slot="input-group-control"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 px-3 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none",
        "rounded-none border-0 bg-transparent px-3 py-2 text-base outline-none md:text-sm",
        className
      )}
      {...props}
    />
  )
}

function InputGroupButton({
  className,
  ...props
}: React.ComponentProps<typeof Button> & { "data-slot"?: string }) {
  return (
    <Button
      data-slot="input-group-button"
      className={cn("h-9 rounded-none", className)}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea }

