/**
 * AppSelect — compact 24px select for editor panels and dense layouts.
 *
 * Re-exports the radix-based building blocks from `@/components/ui/select` so
 * call sites use a single import surface. The trigger, items, and labels are
 * all sized to `.text-panel` (12px/24px) so the open dropdown matches the
 * trigger and the rest of the editor's compact form chrome.
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

/**
 * Compact item for editor/panel dropdowns. Overrides the default `text-sm`
 * so dropdown items match the trigger's `.text-panel` (12px/24px) using
 * the `.text-panel-tight` utility (12/24/py-0.5 = 28px row).
 */
function AppSelectItem({
  className,
  ...props
}: React.ComponentProps<typeof SelectItem>) {
  return <SelectItem className={cn("text-panel-tight", className)} {...props} />
}

/** Compact label for editor/panel dropdowns — matches `.text-panel-tight`. */
function AppSelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectLabel>) {
  return <SelectLabel className={cn("text-panel-tight", className)} {...props} />
}

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
  AppSelectItem,
  AppSelectLabel,
  SelectSeparator as AppSelectSeparator,
  AppSelectTrigger,
  SelectValue as AppSelectValue,
}
