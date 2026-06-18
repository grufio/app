"use client"

/**
 * Floating editor **section** navigation:
 *   - Top-left, a vertical stack of pills: Home, the dark/light tone toggle
 *     and the Eye view-options menu (Trace section only).
 *   - Bottom-centre, a horizontal pill: the four section icons (Image / Filter
 *     / Trace / Color) that switch the active `EditorSection`.
 *
 * The active section's *functions* live in `EditorTopBar` (top-right). Tone
 * comes from the `EditorToolbarTone` context, identical to the other bars.
 */
import { useState } from "react"
import Link from "next/link"
import { Eye, Home, Moon, Sun } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { EditorSection } from "@/lib/editor/editor-sections"
import { cn } from "@/lib/utils"

import { SECTION_ITEMS } from "./editor-section-items"
import { useEditorToolbarTone, type ToolbarTone } from "./editor-toolbar-tone"
import { pillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

export type EditorNavViewOptions = {
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
  numbersLayerVisible: boolean
  onTraceOverlayChange: (visible: boolean) => void
  onPreviewBitmapChange: (visible: boolean) => void
  onNumbersLayerChange: (visible: boolean) => void
}

type Props = {
  activeSection: EditorSection
  onSelectSection: (section: EditorSection) => void
  /** Dark/light tone toggle, rendered as a pill in the top-left stack. */
  theme: { value: ToolbarTone; onToggle: () => void }
  /** Eye view-options menu (Trace section only). Null → no Eye pill. */
  viewOptions?: EditorNavViewOptions | null
}

export function EditorNav({ activeSection, onSelectSection, theme, viewOptions = null }: Props) {
  const tone = useEditorToolbarTone()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      {/* Top-left: Home, theme toggle, Eye (vertical pills). */}
      <div className="absolute top-3 left-3 z-20 flex flex-col items-start gap-2">
        <div className={pillClass(tone, "single")}>
          <ToolbarIconButton label="Home" asChild>
            <Link href="/dashboard">
              <Home aria-hidden="true" className="size-6" />
            </Link>
          </ToolbarIconButton>
        </div>

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

        {/* Eye view-options (Trace section only). The menu stays open on toggle
            via preventDefault (multi-toggle, not a picker). */}
        {viewOptions ? (
          <div className={pillClass(tone, "single")}>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <ToolbarIconButton label="View options" active={menuOpen}>
                  <Eye aria-hidden="true" className="size-6" />
                </ToolbarIconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuCheckboxItem
                  checked={viewOptions.traceOverlayVisible}
                  onCheckedChange={viewOptions.onTraceOverlayChange}
                  onSelect={(e) => e.preventDefault()}
                >
                  Trace
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={viewOptions.previewBitmapVisible}
                  onCheckedChange={viewOptions.onPreviewBitmapChange}
                  onSelect={(e) => e.preventDefault()}
                >
                  Preview
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={viewOptions.numbersLayerVisible}
                  onCheckedChange={viewOptions.onNumbersLayerChange}
                  onSelect={(e) => e.preventDefault()}
                >
                  Numbers
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {/* Bottom-centre: the section switcher (horizontal). */}
      <div
        className={cn(pillClass(tone, "group"), "absolute bottom-4 left-1/2 z-20 -translate-x-1/2")}
      >
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
    </>
  )
}
