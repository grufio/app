"use client"

import { AppButton } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"

import { useEditorToolbarTone, type ToolbarTone } from "./editor-toolbar-tone"
import { ICON_TONE } from "./floating-bar-styles"

type ToolbarIconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  label: string
  active?: boolean
  /** When true, the button forwards its props to its single child via
   * Radix Slot (e.g. wrap a `<Link>` as the rendered element). */
  asChild?: boolean
  /** Force a tone; defaults to the `EditorToolbarTone` context (dark). */
  tone?: ToolbarTone
  children: React.ReactNode
}

/**
 * Square icon button for the Feather-look canvas bars (`floating-toolbar`,
 * `mobile-top-right-bar`, `editor-top-left-bar`, the upload widget). The
 * sibling bar provides the surface; the button is transparent by default
 * and lights up on hover.
 *
 * Active state is signalled via icon brightness only (active vs. the dimmer
 * inactive glyph) — no background pill, no ring. Colours follow the tone:
 * dark bars use white ink, light bars use `zinc-900` (the same black as the
 * dark bar's background). The tone comes from the `EditorToolbarTone`
 * context unless overridden via the `tone` prop.
 */
export function ToolbarIconButton({ label, active = false, asChild = false, tone, className, children, ...props }: ToolbarIconButtonProps) {
  const ctxTone = useEditorToolbarTone()
  const ink = ICON_TONE[tone ?? ctxTone]
  const buttonClassName = cn(
    "h-8 w-8 min-h-8 min-w-8 max-h-8 max-w-8 rounded aspect-square p-0 shrink-0",
    !active && ink.inactive,
    active && ink.active,
    // Neutralize the ghost variant's default hover; we paint our own.
    "hover:bg-transparent",
    ink.hover,
    "disabled:bg-transparent disabled:opacity-100 disabled:hover:bg-transparent",
    ink.disabled,
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
