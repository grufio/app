"use client"

import { AppButton } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"

type ToolbarIconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  label: string
  active?: boolean
  /** When true, the button forwards its props to its single child via
   * Radix Slot (e.g. wrap a `<Link>` as the rendered element). */
  asChild?: boolean
  children: React.ReactNode
}

/**
 * Square icon button for the dark Feather-look canvas bars
 * (`floating-toolbar`, `mobile-top-right-bar`, the upload widget).
 * The sibling bar provides the `bg-zinc-900/95` container; the button
 * is transparent by default and lights up on hover.
 *
 * Active state is signalled via icon brightness only (`text-white` vs.
 * the inactive `text-white/70`) — no background pill, no ring. The
 * tightly packed bar in Feather 3D works the same way: the user reads
 * "this one is on" from the brighter glyph, not from a circle drawn
 * around it.
 */
export function ToolbarIconButton({ label, active = false, asChild = false, className, children, ...props }: ToolbarIconButtonProps) {
  const buttonClassName = cn(
    "h-8 w-8 min-h-8 min-w-8 max-h-8 max-w-8 rounded aspect-square p-0 shrink-0",
    !active && "text-white/70",
    active && "text-white",
    // Neutralize the ghost variant's default hover; we paint our own.
    "hover:bg-transparent",
    "hover:text-white",
    "disabled:bg-transparent disabled:text-white/30 disabled:opacity-100 disabled:hover:bg-transparent",
    className
  )

  return (
    <AppButton
      {...(asChild ? {} : { type: "button" as const })}
      asChild={asChild}
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
