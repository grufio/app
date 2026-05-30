"use client"

/**
 * Insta-style bottom navigation bar for the canvas editor on mobile
 * (`< md`). Sits in the normal flex flow as the last child of the
 * editor shell, so the canvas above shrinks to fit and the bar
 * occupies real layout space (no `position: fixed`, no overlap, no
 * `pb-*` hacks on the canvas).
 *
 * Visual-only for now — every button is a click-stub with `aria-label`
 * for screen readers. **Icons only, no text labels** — the bar mirrors
 * Insta's tab-bar style where the icon alone carries the meaning. The
 * routing / section-state wiring lands in a follow-up.
 *
 * Mobile gate sits on the `<nav>` itself (`md:hidden`); on desktop the
 * bar is `display: none` — Browser allocates no layout, click targets
 * are unreachable, nothing leaks above the breakpoint.
 */
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

type NavItem = {
  key: string
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

export function MobileBottomNav() {
  return (
    <nav
      aria-label="Editor sections"
      className="shrink-0 border-t bg-background pb-safe md:hidden"
    >
      <ul className="flex items-center justify-around py-2">
        {ITEMS.map(({ key, label, Icon }) => (
          <li key={key}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={label}
            >
              <Icon aria-hidden="true" className="size-6" />
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
