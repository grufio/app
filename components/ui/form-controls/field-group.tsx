"use client"

import * as React from "react"

import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/form-controls/input-group"
import { cn } from "@/lib/utils"

const fieldGroupBase =
  "dark:bg-input/30 border-input bg-transparent rounded-md border shadow-xs transition-[color,box-shadow] outline-none"

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

export { AppFieldGroup, AppFieldGroupAddon, AppFieldGroupText }
