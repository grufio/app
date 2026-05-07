"use client"

import type { ComponentProps } from "react"

import { AppButton } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"

type RightPanelIconButtonProps = Omit<ComponentProps<typeof AppButton>, "variant" | "size">

export function RightPanelIconButton({ className, ...props }: RightPanelIconButtonProps) {
  return <AppButton variant="ghost" size="icon" className={cn("h-6 w-6", className)} {...props} />
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
          : "bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}
