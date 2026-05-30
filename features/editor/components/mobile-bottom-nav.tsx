"use client"

/**
 * Insta-style bottom navigation bar for the canvas editor on mobile
 * (`< md`). Sits in the normal flex flow as the last child of the
 * editor shell, so the canvas (or active mobile sheet) above shrinks
 * to fit and the bar occupies real layout space (no `position: fixed`,
 * no overlap, no `pb-*` hacks on the canvas).
 *
 * Six icons (Home / Artboard / Filter / Trace / Colors / Output) —
 * **Home** navigates to `/dashboard` via Next.js `<Link>`, **Artboard**
 * calls `onSectionTap("artboard")` so the shell opens the mobile
 * artboard sheet. Filter / Trace / Colors / Output remain stubs until
 * their own follow-ups land.
 *
 * Mobile gate sits on the `<nav>` itself (`md:hidden`); on desktop the
 * bar is `display: none` — Browser allocates no layout, click targets
 * are unreachable, nothing leaks above the breakpoint.
 */
import Link from "next/link"
import {
  FileOutput,
  Frame,
  Grid3x3,
  Home,
  Palette,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"

export type MobileNavSection =
  | "artboard"
  | "filter"
  | "trace"
  | "colors"
  | "output"

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
  { key: "output", label: "Output", Icon: FileOutput },
]

export function MobileBottomNav(props: {
  onSectionTap?: (section: MobileNavSection) => void
}) {
  const { onSectionTap } = props
  return (
    <nav
      aria-label="Editor sections"
      className="shrink-0 border-t bg-background pb-safe md:hidden"
    >
      <ul className="flex items-center justify-around py-2">
        {ITEMS.map(({ key, label, Icon }) => (
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
                aria-label={label}
                onClick={() => onSectionTap?.(key)}
              >
                <Icon aria-hidden="true" className="size-6" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
