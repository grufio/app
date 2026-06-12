/**
 * Tone-aware class helpers for the floating canvas bars.
 *
 * Dark and light are exact inverses: dark = `bg-zinc-900/95` + white
 * icons; light = `bg-white/95` + `zinc-900` icons (the SAME black as the
 * dark theme's background). Shadow / blur / radius / sizing are identical
 * across tones — only the surface + ink colours flip.
 */
import { cn } from "@/lib/utils"

import type { ToolbarTone } from "./editor-toolbar-tone"

/** Shared pill chrome (no colour). */
const PILL_COMMON = "inline-flex items-center rounded-lg shadow-lg backdrop-blur"

/** Surface + ring per tone. */
const PILL_MATERIAL: Record<ToolbarTone, string> = {
  dark: "bg-zinc-900/95 ring-1 ring-white/10",
  light: "bg-white/95 ring-1 ring-zinc-900/10",
}

export type PillVariant = "single" | "group"

/** Padding/gap per pill shape (matches the historical PILL_* constants). */
const PILL_VARIANT: Record<PillVariant, string> = {
  // 32px button + 4px padding → 40×40 square.
  single: "p-1",
  // Same height/padding/gap as the bottom floating toolbar.
  group: "gap-3 px-2 py-1",
}

export function pillClass(tone: ToolbarTone, variant: PillVariant): string {
  return cn(PILL_COMMON, PILL_MATERIAL[tone], PILL_VARIANT[variant])
}

/** Ink + hover for an active (interactive) chip — shared by circles & frames. */
const CHIP_TONE: Record<ToolbarTone, string> = {
  dark: "text-white hover:bg-zinc-800",
  light: "text-zinc-900 hover:bg-zinc-100",
}

/**
 * Disabled/non-active chip. Mirrors the active chip's chrome (ring/size/shadow)
 * but dims the surface + ink and drops hover:
 *   dark  → lighter-black surface (`bg-zinc-800`) + grey icon (`text-white/40`)
 *   light → light-grey surface (`bg-zinc-200/90`) + dark-grey icon (`text-zinc-900/40`)
 * The two tones are perceptual mirrors: `zinc-800` ↔ `zinc-200` are equidistant
 * around mid-grey and both inks drop to 40% of the tone's base black. The ring
 * is inlined here (not via PILL_MATERIAL) so the variant emits exactly ONE
 * `bg-` utility — two `bg-` classes on one element resolve by stylesheet source
 * order, not class-string order, which would make the surface unpredictable.
 */
const CHIP_INACTIVE_TONE: Record<ToolbarTone, string> = {
  dark: "bg-zinc-800 ring-1 ring-white/10 text-white/40",
  light: "bg-zinc-200/90 ring-1 ring-zinc-900/10 text-zinc-900/40",
}

export type ChipVariant = "active" | "inactive"

/** A 40×40 chip: `rounded` sets the shape (`rounded-full` circle / `rounded-lg`
 * frame); the surface/ink follow the active vs inactive variant. */
function chipClass(tone: ToolbarTone, rounded: string, variant: ChipVariant): string {
  const surface =
    variant === "active" ? cn(PILL_MATERIAL[tone], CHIP_TONE[tone]) : CHIP_INACTIVE_TONE[tone]
  return cn(
    PILL_COMMON,
    "flex size-10 shrink-0 items-center justify-center transition-colors",
    rounded,
    surface,
  )
}

/** The `+` / Edit / Delete FAB circles (round). */
export function circleClass(tone: ToolbarTone, variant: ChipVariant = "active"): string {
  return chipClass(tone, "rounded-full", variant)
}

/** Trace-kind frames: the same chip but rounded-rect, so the kind icons keep
 * their framed look (not circles). Standalone + stacked, one per kind. */
export function frameClass(tone: ToolbarTone, variant: ChipVariant = "active"): string {
  return chipClass(tone, "rounded-lg", variant)
}

/**
 * The section-menu trigger: a 20×40 stadium with an ellipsis when closed,
 * morphing to a 40×40 circle with an × when open. Reuses the shared pill
 * chrome + tone material but is composed directly (not via `chipClass`) so it
 * emits exactly ONE `transition-*` utility — `transition-all`, so the size and
 * shape animate. (Two competing `transition-*` utilities would resolve by
 * stylesheet source order, not class-string order — same caution as the `bg-`
 * note above.)
 */
export function fabTriggerClass(tone: ToolbarTone, open: boolean): string {
  return cn(
    PILL_COMMON,
    "flex shrink-0 items-center justify-center transition-all duration-200",
    open ? "size-10" : "h-5 w-10",
    "rounded-full",
    PILL_MATERIAL[tone],
    CHIP_TONE[tone],
  )
}

/** Icon-button ink per tone (consumed by `ToolbarIconButton`). The light
 * theme uses `zinc-900` — the same black as the dark theme's background. */
export const ICON_TONE: Record<
  ToolbarTone,
  { inactive: string; active: string; hover: string; disabled: string }
> = {
  dark: {
    inactive: "text-white/70",
    active: "text-white",
    hover: "hover:text-white",
    disabled: "disabled:text-white/30",
  },
  light: {
    inactive: "text-zinc-900/70",
    active: "text-zinc-900",
    hover: "hover:text-zinc-900",
    disabled: "disabled:text-zinc-900/30",
  },
}
