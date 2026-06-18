"use client"

/**
 * Floating **navigation** in the top-left corner of the editor canvas:
 *
 *   1. Standalone Home pill — links to `/dashboard`.
 *   2. A collapsible section drawer beneath it, toggled by a small "Lasche"
 *      (tab). Collapsed → a ▶ handle (tap to expand); expanded → the vertical
 *      section pill (Image / Filter / Trace / Color) with a ◀ handle on its
 *      right (tap to collapse). Starts collapsed so the canvas stays clear.
 *
 * Pure navigation — no function menus. The active section's *functions* live
 * in `EditorTopBar` (top-right). Tone comes from the `EditorToolbarTone`
 * context, identical to the other floating bars.
 */
import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Home, Moon, Sun } from "lucide-react"

import type { EditorSection } from "@/lib/editor/editor-sections"
import { cn } from "@/lib/utils"

import { SECTION_ITEMS } from "./editor-section-items"
import { useEditorToolbarTone, type ToolbarTone } from "./editor-toolbar-tone"
import { fabTriggerClass, pillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

type Props = {
  activeSection: EditorSection
  onSelectSection: (section: EditorSection) => void
  /** Dark/light tone toggle, rendered as a pill beneath the nav drawer. */
  theme: { value: ToolbarTone; onToggle: () => void }
}

export function EditorNav({ activeSection, onSelectSection, theme }: Props) {
  const tone = useEditorToolbarTone()
  const [navOpen, setNavOpen] = useState(false)

  // The collapse/expand tab ("Lasche") — a stadium handle (reuses the
  // fab-trigger chrome) whose chevron points the way it moves the drawer.
  const handle = (open: boolean) => (
    <button
      type="button"
      aria-label={open ? "Collapse navigation" : "Expand navigation"}
      aria-expanded={open}
      onClick={() => setNavOpen(!open)}
      className={fabTriggerClass(tone, false)}
    >
      {open ? (
        <ChevronLeft aria-hidden="true" className="size-4" />
      ) : (
        <ChevronRight aria-hidden="true" className="size-4" />
      )}
    </button>
  )

  return (
    <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-2">
      {/* Home */}
      <div className={pillClass(tone, "single")}>
        <ToolbarIconButton label="Home" asChild>
          <Link href="/dashboard">
            <Home aria-hidden="true" className="size-6" />
          </Link>
        </ToolbarIconButton>
      </div>

      {navOpen ? (
        // Expanded: vertical section pill + collapse handle on the right
        // (the gap leaves space for the tab, per the design).
        <div className="flex items-center gap-1">
          {/* `px-1` keeps the vertical pill 40px wide (matches the Home pill). */}
          <div className={cn(pillClass(tone, "group"), "flex-col px-1")}>
            {SECTION_ITEMS.map(({ key, label, Icon }) => (
              <ToolbarIconButton
                key={key}
                label={label}
                active={key === activeSection}
                onClick={() => onSelectSection(key)}
              >
                <Icon aria-hidden="true" className="size-6" />
              </ToolbarIconButton>
            ))}
          </div>
          {handle(true)}
        </div>
      ) : (
        // Collapsed: just the expand handle beneath Home.
        handle(false)
      )}

      {/* Dark/light toggle — beneath the nav drawer. */}
      <div className={pillClass(tone, "single")}>
        <ToolbarIconButton
          label={theme.value === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={theme.onToggle}
        >
          {theme.value === "dark" ? (
            <Sun aria-hidden="true" className="size-6" />
          ) : (
            <Moon aria-hidden="true" className="size-6" />
          )}
        </ToolbarIconButton>
      </div>
    </div>
  )
}
