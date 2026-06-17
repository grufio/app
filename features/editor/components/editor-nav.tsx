"use client"

/**
 * Floating **navigation** bar in the top-left corner of the editor canvas —
 * a vertical column of Feather-style pills. Pure navigation, no function
 * menus (Material guidance: top-level destinations that switch directly):
 *
 *   1. Standalone Home pill — links to `/dashboard`
 *   2. Group pill — the four section icons (Image / Filter / Trace / Color)
 *      stacked vertically, switching the active `EditorSection`
 *
 * The active section's *functions* live in `EditorTopBar` (top-right, under
 * the theme bar); this bar only changes which section is active. Tone comes
 * from the `EditorToolbarTone` context, identical to the other floating bars.
 */
import Link from "next/link"
import { Home } from "lucide-react"

import type { EditorSection } from "@/lib/editor/editor-sections"
import { cn } from "@/lib/utils"

import { SECTION_ITEMS } from "./editor-section-items"
import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { pillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

type Props = {
  activeSection: EditorSection
  onSelectSection: (section: EditorSection) => void
}

export function EditorNav({ activeSection, onSelectSection }: Props) {
  const tone = useEditorToolbarTone()

  return (
    <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-3">
      <div className={pillClass(tone, "single")}>
        <ToolbarIconButton label="Home" asChild>
          <Link href="/dashboard">
            <Home aria-hidden="true" className="size-6" />
          </Link>
        </ToolbarIconButton>
      </div>
      <div className={cn(pillClass(tone, "group"), "flex-col")}>
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
    </div>
  )
}
