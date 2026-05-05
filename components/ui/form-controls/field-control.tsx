"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export const FieldControl = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentPropsWithoutRef<typeof Input>
>(function FieldControl({ className, ...rest }, ref) {
  return (
    <Input
      data-slot="input-group-control"
      ref={ref}
      className={cn(
        "h-6 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[12px] leading-[24px] shadow-none focus-visible:ring-0 dark:bg-transparent",
        className
      )}
      {...rest}
    />
  )
})
