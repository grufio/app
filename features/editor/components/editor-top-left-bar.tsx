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
import {
  Frame,
  Grid3x3,
  Home,
  Palette,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"

import type { MobileSection } from "@/lib/editor/mobile-sections"

import { ToolbarIconButton } from "./toolbar-icon-button"

const PILL_BASE =
  "inline-flex items-center rounded-lg bg-zinc-900/95 shadow-lg ring-1 ring-white/10 backdrop-blur"
/** Single-button pill: `p-0.5` so the pill height matches the group
 * pill exactly.
 *   - Button: h-8 (32 px)
 *   - Group pill height: 32 + 2×py-0.5 (4 px) = 36 px
 *   - Solo pill with p-0.5: 32 + 4 = 36 px → flush with group
 *   - Solo pill width with p-0.5: 32 + 4 = 36 px → square 36×36
 * `p-0` (32 × 32) is visibly shorter than the group; more padding
 * makes the solo "frame" the icon and read as a bigger element. */
const PILL_SINGLE = `${PILL_BASE} p-0.5`
/** Multi-button pill: same `gap-3 px-2 py-0.5` rhythm as the bottom
 * floating toolbar so the three bars read as one family. */
const PILL_GROUP = `${PILL_BASE} gap-3 px-2 py-0.5`

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

type Props = {
  activeSection?: MobileSection | null
  onSectionTap?: (section: MobileSection) => void
}

export function EditorTopLeftBar({ activeSection = null, onSectionTap }: Props) {
  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-3">
      <div className={PILL_SINGLE}>
        <ToolbarIconButton label="Home" asChild>
          <Link href="/dashboard">
            <Home aria-hidden="true" className="size-4" />
          </Link>
        </ToolbarIconButton>
      </div>
      <div className={PILL_GROUP}>
        {SECTION_ITEMS.map(({ key, label, Icon }) => (
          <ToolbarIconButton
            key={key}
            label={label}
            active={key === activeSection}
            onClick={() => onSectionTap?.(key)}
          >
            <Icon aria-hidden="true" className="size-4" />
          </ToolbarIconButton>
        ))}
      </div>
    </div>
  )
}
