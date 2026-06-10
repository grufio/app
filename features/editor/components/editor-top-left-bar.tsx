"use client"

/**
 * Floating navigation bar in the top-left corner of the editor canvas.
 * Two dark Feather-style pills:
 *
 *   1. Standalone Home pill — links to `/dashboard`
 *   2. Group pill — four section icons (Image / Filter / Trace / Color)
 *      whose tap behaviour mirrors `MobileBottomNav` exactly
 *
 * This bar is the planned long-term replacement for `MobileBottomNav`.
 * Both coexist during the transition phase so the user can compare
 * the surfaces before the bottom bar gets retired in a follow-up.
 *
 * The bar is **viewport-agnostic** — mounted on both mobile and
 * desktop. On desktop it visually overlaps the left-panel sidebar;
 * that's an accepted transitional cosmetic issue, to be resolved by
 * moving the mount inside the canvas-stage in a later iteration.
 *
 * "Image" label vs `artboard` section key: the `MobileSection` tuple
 * (`["artboard", "filter", "trace", "colors"]`) is unchanged — only
 * the user-facing label says "Image". Renaming the key would ripple
 * through `mobile-sections.ts` plus the display-layer plumbing, out
 * of scope for this bar.
 */
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  CircleDot,
  Frame,
  Grid2x2,
  Grid3x3,
  Home,
  Palette,
  Plus,
  SlidersHorizontal,
  Spline,
  type LucideIcon,
} from "lucide-react"

import type { MobileSection } from "@/lib/editor/mobile-sections"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import { cn } from "@/lib/utils"

import { ToolbarIconButton } from "./toolbar-icon-button"

const PILL_BASE =
  "inline-flex items-center rounded-lg bg-zinc-900/95 shadow-lg ring-1 ring-white/10 backdrop-blur"
/** Single-button pill: `p-1` so the container is a 40 × 40 square
 * (32 px button + 4 px padding each side). Matches the bottom
 * floating-toolbar's height (`py-1` → 40 px) but stays square. */
const PILL_SINGLE = `${PILL_BASE} p-1`
/** Multi-button pill: same `gap-3 px-2 py-1` as the bottom floating
 * toolbar (`floating-toolbar.tsx:92`) — same height, padding, gap. */
const PILL_GROUP = `${PILL_BASE} gap-3 px-2 py-1`
/** Sub-pill that hangs under a section icon (Feather-3D pattern).
 * Same material as the main pills but a **vertical** icon stack:
 * the sub-menu drops downward as a column beneath the parent icon. */
const PILL_SUB = `${PILL_BASE} flex-col gap-2 px-0.5 py-1.5`

type SectionItem = {
  key: MobileSection
  label: string
  Icon: LucideIcon
}

const SECTION_ITEMS: SectionItem[] = [
  { key: "artboard", label: "Image", Icon: Frame },
  { key: "filter", label: "Filter", Icon: SlidersHorizontal },
  { key: "trace", label: "Trace", Icon: Grid3x3 },
  { key: "colors", label: "Color", Icon: Palette },
]

type TraceKindItem = { key: RegisteredTraceId; label: string; Icon: LucideIcon }

const TRACE_KIND_ITEMS: TraceKindItem[] = [
  { key: "pixelate", label: "Pixelate", Icon: Grid2x2 },
  { key: "circulate", label: "Circulate", Icon: CircleDot },
  { key: "lineart", label: "Lineart", Icon: Spline },
]

type Props = {
  activeSection?: MobileSection | null
  onSectionTap?: (section: MobileSection) => void
  /** Fired when the user picks a trace kind from the sub-pill. The
   * shell wires this to open the matching configure dialog directly,
   * bypassing the kind picker. */
  onTraceKindTap?: (kind: RegisteredTraceId) => void
  /** The currently-applied trace kind, or `null` when none is set.
   * Trace is mutually exclusive — at most one kind active per project.
   * When set, the sub-pill collapses to just that one kind (tapping it
   * re-opens its configure dialog to edit). To switch kinds, remove the
   * trace first (Remove trace in the Trace sidebar), which re-exposes
   * all three. */
  activeTraceKind?: RegisteredTraceId | null
}

export function EditorTopLeftBar({
  activeSection = null,
  onSectionTap,
  onTraceKindTap,
  activeTraceKind = null,
}: Props) {
  const [traceSubOpen, setTraceSubOpen] = useState(false)
  const traceWrapperRef = useRef<HTMLDivElement>(null)

  // Trace is single-active: once a kind is applied the sub-pill shows
  // only that kind, mirroring the mutually-exclusive model. With no
  // trace set, all kinds are offered.
  const traceKindItems = activeTraceKind
    ? TRACE_KIND_ITEMS.filter((item) => item.key === activeTraceKind)
    : TRACE_KIND_ITEMS

  useEffect(() => {
    if (!traceSubOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (target && traceWrapperRef.current?.contains(target)) return
      setTraceSubOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [traceSubOpen])

  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-3">
      <div className={PILL_SINGLE}>
        <ToolbarIconButton label="Home" asChild>
          <Link href="/dashboard">
            <Home aria-hidden="true" className="size-6" />
          </Link>
        </ToolbarIconButton>
      </div>
      <div className={PILL_GROUP}>
        {SECTION_ITEMS.map(({ key, label, Icon }) => {
          if (key === "trace") {
            return (
              <div key={key} ref={traceWrapperRef} className="relative">
                {/* The Trace icon only navigates to the trace section
                    (parity with the other icons); it no longer toggles
                    the kind menu. */}
                <ToolbarIconButton
                  label={label}
                  active={activeSection === "trace"}
                  onClick={() => onSectionTap?.(key)}
                >
                  <Icon aria-hidden="true" className="size-6" />
                </ToolbarIconButton>
                {/* Vertical stack under the Trace icon, always present:
                    the + circle toggles the kind menu that drops directly
                    beneath it. */}
                {/* `mt-3` (12px from the icon's bottom) lands the circle
                    8px below the pill's bottom edge — the pill's `py-1`
                    eats 4px — so the toolbar→circle gap matches the
                    circle→submenu `gap-2` (8px). */}
                <div className="absolute top-full left-1/2 mt-3 flex -translate-x-1/2 flex-col items-center gap-2">
                  <button
                    type="button"
                    aria-label={traceSubOpen ? "Close trace menu" : "Add trace"}
                    aria-expanded={traceSubOpen}
                    onClick={() => setTraceSubOpen((open) => !open)}
                    className={cn(PILL_BASE, "flex size-10 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-zinc-800")}
                  >
                    <Plus
                      aria-hidden="true"
                      className={cn(
                        "size-5 transition-transform duration-200",
                        traceSubOpen && "rotate-45",
                      )}
                    />
                  </button>
                  {traceSubOpen && (
                    // Single active kind → compact 40×40 pill; the full
                    // 3-kind picker → the taller vertical sub-pill.
                    <div className={traceKindItems.length === 1 ? PILL_SINGLE : PILL_SUB}>
                      {traceKindItems.map(({ key: kindKey, label: kindLabel, Icon: KindIcon }) => (
                        <ToolbarIconButton
                          key={kindKey}
                          label={kindLabel}
                          onClick={() => {
                            setTraceSubOpen(false)
                            onTraceKindTap?.(kindKey)
                          }}
                        >
                          <KindIcon aria-hidden="true" className="size-6" />
                        </ToolbarIconButton>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          }
          return (
            <ToolbarIconButton
              key={key}
              label={label}
              active={key === activeSection}
              onClick={() => onSectionTap?.(key)}
            >
              <Icon aria-hidden="true" className="size-6" />
            </ToolbarIconButton>
          )
        })}
      </div>
    </div>
  )
}
