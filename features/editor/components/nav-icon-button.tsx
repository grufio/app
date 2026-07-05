"use client"

import { AppButton } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"

import { useEditorToolbarTone, type ToolbarTone } from "./editor-toolbar-tone"
import { NAV_ICON_TONE } from "./floating-bar-styles"

type NavIconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  label: string
  /** When true, the icon sits in a filled grey CHIP (the active-section /
   * active-tool indicator of the new nav design), not just brightened ink. */
  active?: boolean
  /** Forward props to a single child via Radix Slot (used by
   * `DropdownMenuTrigger asChild`, which sets this on its own child). */
  asChild?: boolean
  /** Force a tone; defaults to the `EditorToolbarTone` context (dark). */
  tone?: ToolbarTone
  /** Override the active chip surface (e.g. the tools bar's lighter chip). */
  chipClassName?: string
  children: React.ReactNode
}

/**
 * 32×32 icon button for the new nav design (Figma node `1-2`) — the section
 * stepper now, the tools bar / top-right actions in the follow-up step. Sibling
 * of `ToolbarIconButton`, but the ACTIVE state is a filled grey chip
 * (`neutral-700` dark) with a 6px radius, and icons are 20px (`size-5`).
 *
 * A separate component (not a flag on `ToolbarIconButton`) so the existing
 * home/view/tools bars keep their chip-less "brighten only" active style.
 */
export function NavIconButton({
  label,
  active = false,
  asChild = false,
  tone,
  chipClassName,
  className,
  children,
  ...props
}: NavIconButtonProps) {
  const ctxTone = useEditorToolbarTone()
  const t = NAV_ICON_TONE[tone ?? ctxTone]
  const buttonClassName = cn(
    "flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md p-0 aspect-square transition-colors",
    active ? cn(chipClassName ?? t.chip, t.ink) : cn("bg-transparent", t.inkDim, t.hover),
    "disabled:bg-transparent disabled:opacity-100 disabled:hover:bg-transparent",
    t.disabled,
    className,
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
