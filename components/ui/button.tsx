/**
 * Button UI primitive.
 *
 * Responsibilities:
 * - Provide consistent button styling and variants across the app.
 * - Wrap Radix `Slot` to support `asChild`.
 */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Shared variant palette used by both `Button` (this file) and `AppButton`
// (components/ui/form-controls/app-button.tsx). Keep colors/affordances in
// one place; sizing differs between the two so each declares its own size
// scale.
//
// Picking a variant:
//   default     — primary CTA on a surface (Login, Apply, Save, Add).
//   destructive — irreversible action that deletes/clears data.
//   outline     — secondary CTA in dialogs (Cancel) or panels (Add filter
//                 next to a primary). Visible at rest, less weight than
//                 the filled `default`.
//   secondary   — *active* state of a toggle/tool button. Filled muted
//                 background reads as "selected" without competing with
//                 `default`'s primary color. Pair with `ghost` for the
//                 inactive state (see canvas-tool-sidebar).
//   ghost       — chromeless trigger that only reveals itself on hover
//                 (icon buttons in toolbars, dropdown menu items, the
//                 inactive state of a `secondary` toggle).
//
// Removed (2026-05-07): `link` had zero consumers. `secondary` was
// briefly removed and re-added once the toolbar-toggle use-case
// surfaced — keep it scoped to that pattern.
export const buttonVariantClasses = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive:
    "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
  outline:
    "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground",
} as const

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-purple focus-visible:ring-purple/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: buttonVariantClasses,
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-7 rounded-md gap-1 px-2.5 text-xs",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-7",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
