"use client"

import * as React from "react"

import { SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"

export function SelectFieldControl(props: React.ComponentProps<typeof SelectTrigger>) {
  const { className, ...rest } = props
  return (
    <SelectTrigger
      className={cn("flex-1 min-w-0 overflow-hidden whitespace-nowrap", className)}
      {...rest}
    />
  )
}
