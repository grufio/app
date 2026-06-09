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
import { useState } from "react"
import {
  CircleDot,
  Frame,
  Grid3x3,
  Home,
  Palette,
  SlidersHorizontal,
  Spline,
  type LucideIcon,
} from "lucide-react"

import type { MobileSection } from "@/lib/editor/mobile-sections"

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
 * Same material as the main pills, tighter padding + gap so the row
 * reads as secondary. */
const PILL_SUB = `${PILL_BASE} gap-2 px-1.5 py-0.5`

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

type TraceKindItem = { key: string; label: string; Icon: LucideIcon }

const TRACE_KIND_ITEMS: TraceKindItem[] = [
  { key: "pixelate", label: "Pixelate", Icon: Grid3x3 },
  { key: "circulate", label: "Circulate", Icon: CircleDot },
  { key: "lineart", label: "Lineart", Icon: Spline },
]

type Props = {
  activeSection?: MobileSection | null
  onSectionTap?: (section: MobileSection) => void
}

export function EditorTopLeftBar({ activeSection = null, onSectionTap }: Props) {
  const [traceSubOpen, setTraceSubOpen] = useState(false)

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
              <div key={key} className="relative">
                <ToolbarIconButton
                  label={label}
                  active={traceSubOpen}
                  onClick={() => setTraceSubOpen((open) => !open)}
                >
                  <Icon aria-hidden="true" className="size-6" />
                </ToolbarIconButton>
                {traceSubOpen && (
                  <div
                    className={`${PILL_SUB} absolute top-full left-1/2 mt-2 -translate-x-1/2`}
                  >
                    {TRACE_KIND_ITEMS.map(({ key: kindKey, label: kindLabel, Icon: KindIcon }) => (
                      <ToolbarIconButton key={kindKey} label={kindLabel}>
                        <KindIcon aria-hidden="true" className="size-6" />
                      </ToolbarIconButton>
                    ))}
                  </div>
                )}
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
