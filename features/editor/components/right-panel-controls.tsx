"use client"

import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type RightPanelIconButtonProps = Omit<ComponentProps<typeof Button>, "variant" | "size">

export function RightPanelIconButton({ className, ...props }: RightPanelIconButtonProps) {
  return <Button variant="ghost" size="icon" className={cn("h-6 w-6", className)} {...props} />
}

export function RightPanelToggleIconButton({
  active,
  className,
  ...props
}: RightPanelIconButtonProps & { active: boolean }) {
  return (
    <RightPanelIconButton
      aria-pressed={active}
      className={cn(
        active
          ? "bg-black text-white hover:bg-black/90 hover:text-white"
          : "bg-muted text-foreground hover:bg-muted/80",
        className
      )}
      {...props}
    />
  )
}
