"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export const NumericFieldControl = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentPropsWithoutRef<typeof Input>
>(function NumericFieldControl({ className, ...rest }, ref) {
  return (
    <Input
      data-slot="input-group-control"
      ref={ref}
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      {...rest}
    />
  )
})
