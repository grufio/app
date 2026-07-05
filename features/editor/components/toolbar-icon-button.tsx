"use client"

import { AppButton } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"

import { useEditorToolbarTone, type ToolbarTone } from "./editor-toolbar-tone"
import { ICON_TONE, NAV_CHIP_TONE } from "./floating-bar-styles"

type ToolbarIconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  label: string
  active?: boolean
  /** How the active state renders. `"ink"` (default) brightens the icon only —
   * the historical behaviour for every bar. `"chip"` fills a grey chip behind
   * the icon (the new neutral nav design: the stepper's current section, the
   * tools bar's active tool). */
  activeStyle?: "ink" | "chip"
  /** Override the active chip surface (e.g. the tools bar's lighter chip). Only
   * used with `activeStyle="chip"`. */
  chipClassName?: string
  /** When true, the button forwards its props to its single child via
   * Radix Slot (e.g. wrap a `<Link>` as the rendered element). */
  asChild?: boolean
  /** Force a tone; defaults to the `EditorToolbarTone` context (dark). */
  tone?: ToolbarTone
  children: React.ReactNode
}

/**
 * Square icon button for the Feather-look canvas bars (`editor-tools-bar`,
 * `editor-funcs-bar`, the home/view/menu bars, the upload widget). The
 * sibling bar provides the surface; the button is transparent by default
 * and lights up on hover.
 *
 * Active state is signalled via icon brightness only (active vs. the dimmer
 * inactive glyph) — no background pill, no ring. Colours follow the tone:
 * dark bars use white ink, light bars use `zinc-900` (the same black as the
 * dark bar's background). The tone comes from the `EditorToolbarTone`
 * context unless overridden via the `tone` prop.
 */
export function ToolbarIconButton({
  label,
  active = false,
  activeStyle = "ink",
  chipClassName,
  asChild = false,
  tone,
  className,
  children,
  ...props
}: ToolbarIconButtonProps) {
  const ctxTone = useEditorToolbarTone()
  const t = tone ?? ctxTone
  const ink = ICON_TONE[t]
  const chipActive = active && activeStyle === "chip"
  const buttonClassName = cn(
    "h-8 w-8 min-h-8 min-w-8 max-h-8 max-w-8 rounded aspect-square p-0 shrink-0",
    !active && ink.inactive,
    active && ink.active,
    // Background: `chip` active fills a grey chip (kept on hover); otherwise no
    // background ever — this also neutralizes the ghost variant's white hover.
    chipActive ? cn(chipClassName ?? NAV_CHIP_TONE[t].bg, NAV_CHIP_TONE[t].hover) : "hover:bg-transparent",
    ink.hover,
    // Kill AppButton's purple focus-visible ring — no editor nav/toolbar icon
    // shows it (it appears in no Figma nav design).
    "focus-visible:ring-0 focus-visible:ring-transparent focus-visible:border-transparent",
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
