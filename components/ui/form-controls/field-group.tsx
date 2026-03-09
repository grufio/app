"use client"

import * as React from "react"

import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/form-controls/input-group"
import { cn } from "@/lib/utils"

const fieldGroupBase =
  "dark:bg-input/30 border-input bg-transparent rounded-md border shadow-xs transition-[color,box-shadow] outline-none"

// Hover-only affordance; focus/invalid are handled in state selectors below.
const fieldGroupInteractive = "hover:border-muted-foreground/30"

const fieldGroupStateFocus =
  "has-[[data-slot=input-group-control]:focus]:border-purple has-[[data-slot=select-trigger]:focus]:border-purple"
const fieldGroupStateFocusVisible =
  "has-[[data-slot=input-group-control]:focus-visible]:border-purple has-[[data-slot=select-trigger]:focus-visible]:border-purple"
const fieldGroupStateInvalid =
  "has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive has-[[data-slot=select-trigger][aria-invalid=true]]:border-destructive"

const fieldGroupState = cn(fieldGroupStateFocus, fieldGroupStateFocusVisible, fieldGroupStateInvalid)

// Child slots must not create inner corner radii inside the shared group chrome.
const fieldGroupSlotShape = cn(
  "[&>[data-slot=input-group-control]]:rounded-none",
  "[&>[data-slot=input-group-addon]]:rounded-none",
  "[&>[data-slot=input-group-button]]:rounded-none",
  "[&>[data-slot=select-trigger]]:rounded-none"
)

function FieldGroup({ className, ...props }: React.ComponentProps<typeof InputGroup>) {
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

const FieldGroupAddon = InputGroupAddon
const FieldGroupText = InputGroupText

export { FieldGroup, FieldGroupAddon, FieldGroupText }
