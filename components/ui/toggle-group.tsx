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
        // Segmented control look (toggle bar)
        default:
          // Always looks like a functional button group (no selected/active visual state)
          "rounded-none bg-muted hover:bg-muted-foreground/10 text-foreground",
        outline:
          "rounded-none bg-muted hover:bg-muted-foreground/10 text-foreground",
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
      // segmented container (single bar)
      className={cn(
        // No outline. Gray background. Dividers come from items.
        "inline-flex w-full items-stretch overflow-hidden rounded-md bg-muted",
        className
      )}
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
      className={cn(
        toggleGroupItemVariants({ variant, size }),
        // segment separators
        "border-r border-white last:border-r-0 first:rounded-l-md last:rounded-r-md",
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }

