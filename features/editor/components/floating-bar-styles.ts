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

/** The `+` / Delete FAB circles: pill material, round, tone-keyed ink + hover. */
const CIRCLE_TONE: Record<ToolbarTone, string> = {
  dark: "text-white hover:bg-zinc-800",
  light: "text-zinc-900 hover:bg-zinc-100",
}

/**
 * Disabled/non-active kind circle. Mirrors the active circle's chrome
 * (ring/size/shadow) but dims the surface + ink and drops hover:
 *   dark  → lighter-black surface (`bg-zinc-800`) + grey icon (`text-white/40`)
 *   light → light-grey surface (`bg-zinc-200/90`) + dark-grey icon (`text-zinc-900/40`)
 * The two tones are perceptual mirrors: `zinc-800` ↔ `zinc-200` are equidistant
 * around mid-grey and both inks drop to 40% of the tone's base black. The ring
 * is inlined here (not via PILL_MATERIAL) so the variant emits exactly ONE
 * `bg-` utility — two `bg-` classes on one element resolve by stylesheet source
 * order, not class-string order, which would make the surface unpredictable.
 */
const CIRCLE_INACTIVE_TONE: Record<ToolbarTone, string> = {
  dark: "bg-zinc-800 ring-1 ring-white/10 text-white/40",
  light: "bg-zinc-200/90 ring-1 ring-zinc-900/10 text-zinc-900/40",
}

export type CircleVariant = "active" | "inactive"

export function circleClass(tone: ToolbarTone, variant: CircleVariant = "active"): string {
  const surface =
    variant === "active" ? cn(PILL_MATERIAL[tone], CIRCLE_TONE[tone]) : CIRCLE_INACTIVE_TONE[tone]
  return cn(
    PILL_COMMON,
    "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
    surface,
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
