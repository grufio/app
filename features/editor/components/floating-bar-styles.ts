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

export type PillVariant = "single" | "group" | "sub"

/** Padding/gap per pill shape (matches the historical PILL_* constants). */
const PILL_VARIANT: Record<PillVariant, string> = {
  // 32px button + 4px padding → 40×40 square.
  single: "p-1",
  // Same height/padding/gap as the bottom floating toolbar.
  group: "gap-3 px-2 py-1",
  // Vertical icon stack that drops under a section icon.
  sub: "flex-col gap-2 px-0.5 py-1.5",
}

export function pillClass(tone: ToolbarTone, variant: PillVariant): string {
  return cn(PILL_COMMON, PILL_MATERIAL[tone], PILL_VARIANT[variant])
}

/** The `+` / Delete FAB circles: pill material, round, tone-keyed ink + hover. */
const CIRCLE_TONE: Record<ToolbarTone, string> = {
  dark: "text-white hover:bg-zinc-800",
  light: "text-zinc-900 hover:bg-zinc-100",
}

export function circleClass(tone: ToolbarTone): string {
  return cn(
    PILL_COMMON,
    PILL_MATERIAL[tone],
    "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors",
    CIRCLE_TONE[tone],
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
