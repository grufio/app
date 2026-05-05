/**
 * AppButton — compact 24px button used inside editor panels, toolbars, and
 * filter dialogs.
 *
 * Same variant set as `Button` (default/destructive/outline/secondary/ghost/
 * link) but every size collapses to h-6 with 12px text — the dense control
 * style the editor relies on. For full-size action buttons (modal Cancel/
 * Save, login submit, dashboard create) keep using `Button` from
 * `@/components/ui/button`.
 */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { buttonVariantClasses } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const appButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[12px] leading-[24px] py-0 font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-purple focus-visible:ring-purple/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: buttonVariantClasses,
      // All sizes collapse to 24px — that is the whole point of AppButton.
      size: {
        default: "h-6 px-3",
        xs: "h-6 px-3",
        sm: "h-6 px-3",
        lg: "h-6 px-3",
        icon: "h-6 w-6",
        "icon-xs": "h-6 w-6",
        "icon-sm": "h-6 w-6",
        "icon-lg": "h-6 w-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function AppButton({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof appButtonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="app-button"
      data-variant={variant}
      data-size={size}
      className={cn(appButtonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { AppButton, appButtonVariants }
