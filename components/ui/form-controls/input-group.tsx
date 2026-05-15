"use client"

/**
 * Input group UI primitive.
 *
 * Responsibilities:
 * - Compose inputs/selects with addons in one horizontal row.
 * - Provide the App-flavoured wrapper (`AppFieldGroup*`) that adds the
 *   editor-panel border/focus/invalid chrome on top of the bare layout.
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
        // Padding. Consumers that need a tighter gap (e.g. numeric
        // inputs with a trailing unit) override this on a per-instance
        // basis — see `lib/forms/numeric-variant-classes.ts` for the
        // canonical pattern (input pr-2 + addon !pl-0 → 8px gap).
        "px-2",
        // Icon sizing + stroke. `stroke-width:1` matches the editor's
        // thin-line icon convention; CSS overrides lucide's `stroke-width="2"`
        // attribute, so every form-field icon stays consistent without
        // per-instance `strokeWidth={1}` props.
        "[&_svg]:size-4 [&_svg]:[stroke-width:1px]",
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

// --- AppFieldGroup family ----------------------------------------------
//
// Editor-panel-flavoured wrapper around `InputGroup` with the chrome that
// shadcn ships separately: border, focus ring, hover affordance, invalid
// state. Co-located here (instead of a sibling file) so the `data-slot`
// selectors and the bare `InputGroup` stay in one place.
//
// `AppFieldGroupAddon` and `AppFieldGroupText` are aliases — the addon /
// text primitives don't need any extra chrome.

const fieldGroupBase =
  "border-input bg-transparent rounded-md border shadow-xs transition-[color,box-shadow] outline-none"

// Hover-only affordance; focus/invalid are handled in state selectors below.
const fieldGroupInteractive = "hover:border-muted-foreground/30"

// State selectors react to any of the supported control slots:
// - "input-group-control" set by FieldControl (the standard wrapper)
// - "app-input"           set by AppInput when used directly without FieldControl
// - "select-trigger"      set by AppSelectTrigger / SelectTrigger
const fieldGroupStateFocus =
  "has-[[data-slot=input-group-control]:focus]:border-purple has-[[data-slot=input-group-control]:focus]:ring-purple/30 has-[[data-slot=input-group-control]:focus]:ring-[3px] " +
  "has-[[data-slot=app-input]:focus]:border-purple has-[[data-slot=app-input]:focus]:ring-purple/30 has-[[data-slot=app-input]:focus]:ring-[3px] " +
  "has-[[data-slot=select-trigger]:focus]:border-purple has-[[data-slot=select-trigger]:focus]:ring-purple/30 has-[[data-slot=select-trigger]:focus]:ring-[3px]"

const fieldGroupStateFocusVisible =
  "has-[[data-slot=input-group-control]:focus-visible]:border-purple has-[[data-slot=input-group-control]:focus-visible]:ring-purple/30 has-[[data-slot=input-group-control]:focus-visible]:ring-[3px] " +
  "has-[[data-slot=app-input]:focus-visible]:border-purple has-[[data-slot=app-input]:focus-visible]:ring-purple/30 has-[[data-slot=app-input]:focus-visible]:ring-[3px] " +
  "has-[[data-slot=select-trigger]:focus-visible]:border-purple has-[[data-slot=select-trigger]:focus-visible]:ring-purple/30 has-[[data-slot=select-trigger]:focus-visible]:ring-[3px]"

const fieldGroupStateInvalid =
  "has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive " +
  "has-[[data-slot=app-input][aria-invalid=true]]:border-destructive " +
  "has-[[data-slot=select-trigger][aria-invalid=true]]:border-destructive"

const fieldGroupState = cn(fieldGroupStateFocus, fieldGroupStateFocusVisible, fieldGroupStateInvalid)

// Child slots must not create inner corner radii inside the shared group chrome.
const fieldGroupSlotShape = cn(
  "[&>[data-slot=input-group-control]]:rounded-none",
  "[&>[data-slot=app-input]]:rounded-none",
  "[&>[data-slot=input-group-addon]]:rounded-none",
  "[&>[data-slot=input-group-button]]:rounded-none",
  "[&>[data-slot=select-trigger]]:rounded-none"
)

function AppFieldGroup({ className, ...props }: React.ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      className={cn(
        fieldGroupBase,
        fieldGroupInteractive,
        fieldGroupState,
        fieldGroupSlotShape,
        className
      )}
      {...props}
    />
  )
}

const AppFieldGroupAddon = InputGroupAddon
const AppFieldGroupText = InputGroupText

export {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  AppFieldGroup,
  AppFieldGroupAddon,
  AppFieldGroupText,
}
