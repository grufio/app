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

/**
 * New nav design (Figma node `1-2`) — a FLAT dark pill on the `neutral` scale
 * (no ring/shadow/blur, unlike `pillClass`). Built as reusable helpers because
 * the follow-up step (tools bar, top-right actions) reuses the same look.
 * Only the NEW nav elements are on `neutral`; the existing bars stay on `zinc`.
 */

/** Which dark-tone surface a nav pill uses: the stepper is `neutral-900`, the
 * (future) tools bar `neutral-800`. Emits exactly ONE `bg-` utility per pair. */
export type NavPillShade = "900" | "800"
const NAV_PILL_SURFACE: Record<ToolbarTone, Record<NavPillShade, string>> = {
  dark: { "900": "bg-neutral-900", "800": "bg-neutral-800" },
  light: { "900": "bg-neutral-100", "800": "bg-neutral-200" },
}

/** Flat nav pill: 40px tall, radius 8px, 4px padding/gap. Exact px — `rounded-lg`
 * would be `--radius` (10px here), not 8px. */
export function navPillClass(tone: ToolbarTone, shade: NavPillShade = "900"): string {
  return cn("inline-flex h-10 items-center gap-1 rounded-[8px] px-1", NAV_PILL_SURFACE[tone][shade])
}

/**
 * The active CHIP surface for `ToolbarIconButton activeStyle="chip"` (the new
 * neutral nav design: the stepper's current section, the tools bar's active
 * tool). Only the fill + its hover — ink/disabled come from `ICON_TONE`.
 * Distinct from `CHIP_TONE`/`CHIP_INACTIVE_TONE` above, which are on the `zinc`
 * scale for the round, ringed FAB chips.
 */
export const NAV_CHIP_TONE: Record<ToolbarTone, { bg: string; hover: string }> = {
  dark: { bg: "bg-neutral-700", hover: "hover:bg-neutral-600" },
  light: { bg: "bg-neutral-300", hover: "hover:bg-neutral-400" },
}

/** Figma dropdown surface + item styling, tone-aware, reusable across nav menus.
 * Overrides the shadcn defaults: `min-w-0` beats the default `min-w-[8rem]` so
 * `w-28` (112px) sticks; `border-0` kills the default border; the item's
 * `focus:bg-*` beats the default `focus:bg-accent`. Icons carry their own
 * `text-*` at the call site so the default `svg → muted-foreground` rule skips them. */
const NAV_MENU_TONE: Record<ToolbarTone, { content: string; item: string }> = {
  dark: {
    content: "bg-neutral-900 text-white",
    item: "bg-neutral-700 text-white focus:bg-neutral-500 focus:text-white",
  },
  light: {
    content: "bg-neutral-100 text-neutral-900",
    item: "bg-neutral-300 text-neutral-900 focus:bg-neutral-400 focus:text-neutral-900",
  },
}
export function navMenuContentClass(tone: ToolbarTone): string {
  // `flex flex-col` is required — DropdownMenuContent is a block by default, so
  // `gap-1` (the 4px row gap) has no effect without it.
  return cn("flex flex-col w-28 min-w-0 gap-1 rounded-[8px] border-0 p-1", NAV_MENU_TONE[tone].content)
}
export function navMenuItemClass(tone: ToolbarTone): string {
  // radius 6px exact (rounded-md would be 8px here).
  return cn("h-8 gap-2 rounded-[6px] px-2 text-[14px]", NAV_MENU_TONE[tone].item)
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
