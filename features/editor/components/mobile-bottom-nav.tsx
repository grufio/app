"use client"

/**
 * Insta-style bottom navigation bar for the canvas editor on mobile
 * (`< md`). Sits in the normal flex flow as the last child of the
 * editor shell, so the canvas above shrinks to fit and the bar
 * occupies real layout space (no `position: fixed`, no overlap, no
 * `pb-*` hacks on the canvas).
 *
 * Five icons (Home / Artboard / Filter / Trace / Colors) —
 * **Home** navigates to `/dashboard` via Next.js `<Link>`. The
 * remaining icons set the active mobile section via `onSectionTap`
 * — the shell renders the section context on the canvas and the
 * floating Edit-icon opens the section's management sheet.
 *
 * `activeSection` highlights the current section so the user knows
 * which context the Edit-icon will open.
 *
 * Mobile gate sits on the `<nav>` itself (`md:hidden`); on desktop the
 * bar is `display: none` — Browser allocates no layout, click targets
 * are unreachable, nothing leaks above the breakpoint.
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

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type MobileNavSection = "artboard" | "filter" | "trace" | "colors"

type NavItem = {
  key: "home" | MobileNavSection
  label: string
  Icon: LucideIcon
}

const ITEMS: NavItem[] = [
  { key: "home", label: "Home", Icon: Home },
  { key: "artboard", label: "Artboard", Icon: Frame },
  { key: "filter", label: "Filter", Icon: SlidersHorizontal },
  { key: "trace", label: "Trace", Icon: Grid3x3 },
  { key: "colors", label: "Colors", Icon: Palette },
]

export function MobileBottomNav(props: {
  /** Currently active section. Drives the visual highlight. `null`
   * = no section is active (e.g. user is on Home). */
  activeSection?: MobileNavSection | null
  onSectionTap?: (section: MobileNavSection) => void
  /** Surfaces a red dot on the Artboard icon — the Artboard section
   * owns the master image, so an image-lock surfaces there on mobile. */
  imageLocked?: boolean
  /** Surfaces a red dot on the Filter icon. */
  filterLocked?: boolean
}) {
  const { activeSection = null, onSectionTap, imageLocked = false, filterLocked = false } = props
  const dotForKey = (key: NavItem["key"]): boolean => {
    if (key === "artboard") return imageLocked
    if (key === "filter") return filterLocked
    return false
  }
  return (
    <nav
      aria-label="Editor sections"
      className="shrink-0 border-t bg-background pb-safe md:hidden"
    >
      <ul className="flex items-center justify-around py-2">
        {ITEMS.map(({ key, label, Icon }) => {
          const isActive = key !== "home" && key === activeSection
          const showDot = dotForKey(key)
          return (
            <li key={key}>
              {key === "home" ? (
                <Button asChild variant="ghost" size="icon" aria-label={label}>
                  <Link href="/dashboard">
                    <Icon aria-hidden="true" className="size-6" />
                  </Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={showDot ? `${label} (locked)` : label}
                  aria-pressed={isActive}
                  onClick={() => onSectionTap?.(key)}
                  className={cn("relative", isActive && "bg-accent text-accent-foreground")}
                >
                  <Icon aria-hidden="true" className="size-6" />
                  {showDot ? (
                    <span
                      aria-hidden="true"
                      className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive"
                    />
                  ) : null}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
