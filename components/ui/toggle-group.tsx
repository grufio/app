"use client"

import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleGroupItemVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-transparent hover:bg-muted data-[state=on]:bg-muted data-[state=on]:text-foreground",
        outline:
          "border border-input bg-transparent hover:bg-muted data-[state=on]:bg-muted data-[state=on]:text-foreground",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-6 w-6",
        lg: "h-10 px-5",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  }
)

function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

function ToggleGroupItem({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleGroupItemVariants>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleGroupItemVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }

