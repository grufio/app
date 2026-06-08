"use client"

import { AppButton } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"

type ToolbarIconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  label: string
  active?: boolean
  children: React.ReactNode
}

/**
 * Square 40 × 40 icon button styled for the dark Feather-look canvas
 * bars (`floating-toolbar`, `mobile-top-right-bar`, the upload widget).
 * The sibling bar provides the `bg-zinc-900/95` container; this button
 * is transparent by default and lights up on hover / active against
 * that dark fill.
 */
export function ToolbarIconButton({ label, active = false, className, children, ...props }: ToolbarIconButtonProps) {
  const buttonClassName = cn(
    "h-10 w-10 min-h-10 min-w-10 max-h-10 max-w-10 rounded-full aspect-square p-0 shrink-0",
    "text-white/80",
    // Neutralize the ghost variant's default hover; we paint our own.
    "hover:bg-transparent hover:text-current",
    !active && "hover:bg-white/10 hover:text-white",
    active && "bg-white/20 text-white",
    "disabled:bg-transparent disabled:text-white/30 disabled:opacity-100 disabled:hover:bg-transparent",
    className
  )

  return (
    <AppButton
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={active ? true : undefined}
      title={label}
      className={buttonClassName}
      {...props}
    >
      {children}
    </AppButton>
  )
}
