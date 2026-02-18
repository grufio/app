"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ToolbarIconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  label: string
  active?: boolean
  children: React.ReactNode
}

export function ToolbarIconButton({ label, active = false, className, children, ...props }: ToolbarIconButtonProps) {
  const buttonClassName = cn(
    "h-8 w-8 min-h-8 min-w-8 max-h-8 max-w-8 rounded-full aspect-square p-0 shrink-0",
    "text-foreground/80",
    // Neutralize ghost variant hover and enforce a single hover path.
    "hover:bg-transparent hover:text-current",
    !active && "hover:bg-foreground/10 hover:text-foreground",
    active && "bg-black text-white",
    "disabled:bg-transparent disabled:text-muted-foreground/60 disabled:opacity-100 disabled:hover:bg-transparent",
    className
  )

  return (
    <Button
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
    </Button>
  )
}
