/**
 * AppSelect — compact 24px select for editor panels and dense layouts.
 *
 * Re-exports the radix-based building blocks from `@/components/ui/select` so
 * call sites use a single import surface. Only the trigger needs to change
 * size — items/labels in the open dropdown stay at the standard `text-sm`
 * since the dropdown floats above panel chrome and benefits from being
 * readable.
 */
import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectValue,
} from "@/components/ui/select"

function AppSelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "border-input bg-transparent text-foreground flex h-6 w-full items-center justify-between gap-2 rounded-md border px-3 py-0 text-panel shadow-xs outline-none whitespace-nowrap",
        "focus-visible:border-purple focus-visible:ring-purple/30 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export {
  Select as AppSelect,
  SelectContent as AppSelectContent,
  SelectGroup as AppSelectGroup,
  SelectItem as AppSelectItem,
  SelectLabel as AppSelectLabel,
  SelectSeparator as AppSelectSeparator,
  AppSelectTrigger,
  SelectValue as AppSelectValue,
}
