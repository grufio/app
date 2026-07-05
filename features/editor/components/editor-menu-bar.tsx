"use client"

/**
 * menu bar — the bottom-centre section switcher (horizontal pill). Switches
 * the active `EditorSection` (Artboard / Image / Filter / Trace / Color).
 * Tone from the `EditorToolbarTone` context.
 */
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

export function EditorMenuBar({ activeSection, onSelectSection }: Props) {
  const tone = useEditorToolbarTone()
  return (
    <div className={cn(pillClass(tone, "group"), "absolute bottom-4 left-1/2 z-20 -translate-x-1/2")}>
      {SECTION_ITEMS.map(({ key, label, Icon }) => (
        <ToolbarIconButton key={key} label={label} active={key === activeSection} onClick={() => onSelectSection(key)}>
          <Icon aria-hidden="true" className="size-6" />
        </ToolbarIconButton>
      ))}
    </div>
  )
}
