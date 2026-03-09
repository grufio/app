"use client"

import * as React from "react"

import { InputGroup, InputGroupAddon, InputGroupText } from "@/components/ui/form-controls/input-group"
import { cn } from "@/lib/utils"

function FieldGroup({ className, ...props }: React.ComponentProps<typeof InputGroup>) {
  return (
    <InputGroup
      className={cn(
        "dark:bg-input/30 border-input bg-transparent rounded-md border shadow-xs transition-[color,box-shadow] outline-none",
        "hover:border-muted-foreground/30",
        "has-[[data-slot=input-group-control]:focus]:border-[#7C5CFF] has-[[data-slot=select-trigger]:focus]:border-[#7C5CFF]",
        "has-[[data-slot=input-group-control]:focus-visible]:border-[#7C5CFF] has-[[data-slot=select-trigger]:focus-visible]:border-[#7C5CFF]",
        "has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive has-[[data-slot=select-trigger][aria-invalid=true]]:border-destructive",
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

const FieldGroupAddon = InputGroupAddon
const FieldGroupText = InputGroupText

export { FieldGroup, FieldGroupAddon, FieldGroupText }
