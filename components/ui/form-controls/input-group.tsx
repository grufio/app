"use client"

/**
 * Input group UI primitive.
 *
 * Responsibilities:
 * - Compose inputs/selects with addons in one horizontal row.
 * - Sized chrome (border, focus highlight, invalid state) is added by the
 *   `AppFieldGroup` wrapper that lives next door, so this layer is just
 *   layout + addon slots.
 */
import * as React from "react"

import { cn } from "@/lib/utils"

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
        "flex w-full min-w-0 items-stretch",
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
  return (
    <span
      data-slot="input-group-text"
      className={cn("text-panel", className)}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupText }
