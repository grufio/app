"use client"

/**
 * section stepper — top-centre navigation (Figma node `1-2`). Replaces the flat
 * bottom section bar: `‹ [active-section icon] ›`, where the middle button shows
 * the active section in a grey chip and opens a dropdown listing the OTHER
 * sections to jump to. Chevrons step prev/next through the pipeline order
 * (Artboard → Image → Filter → Trace → Color) and disable at the ends (no wrap).
 * Tone from the `EditorToolbarTone` context.
 *
 * Built from the shared `ToolbarIconButton` (not a bespoke button): the chevrons
 * use its default `ink` active style; the middle trigger opts into
 * `activeStyle="chip"` for the filled active-section chip. `rounded-[6px]`
 * overrides its default 4px radius to match the Figma chip (exact px — `rounded-md`
 * would be 8px here because `--radius` is 10px).
 */
import { ChevronLeft, ChevronRight } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { EditorSection } from "@/lib/editor/editor-sections"
import { cn } from "@/lib/utils"

import { SECTION_ITEMS } from "./editor-section-items"
import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { navMenuContentClass, navMenuItemClass, navPillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

type Props = {
  activeSection: EditorSection
  onSelectSection: (section: EditorSection) => void
}

export function EditorSectionStepper({ activeSection, onSelectSection }: Props) {
  const tone = useEditorToolbarTone()
  const activeIndex = Math.max(
    0,
    SECTION_ITEMS.findIndex((s) => s.key === activeSection),
  )
  const active = SECTION_ITEMS[activeIndex]
  const ActiveIcon = active.Icon
  // Item icons carry an explicit tone colour so the dropdown's default
  // "svg → muted-foreground" rule skips them.
  const iconInk = tone === "dark" ? "text-white" : "text-neutral-900"

  return (
    <div className={cn(navPillClass(tone), "absolute top-3 left-1/2 z-20 -translate-x-1/2")}>
      <ToolbarIconButton
        label="Previous section"
        className="rounded-[6px]"
        disabled={activeIndex === 0}
        onClick={() => onSelectSection(SECTION_ITEMS[activeIndex - 1].key)}
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
      </ToolbarIconButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarIconButton
            label={`Section: ${active.label}`}
            className="rounded-[6px]"
            active
            activeStyle="chip"
            data-testid="section-stepper-trigger"
          >
            <ActiveIcon aria-hidden="true" className="size-5" />
          </ToolbarIconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" sideOffset={4} className={navMenuContentClass(tone)}>
          {SECTION_ITEMS.filter((s) => s.key !== activeSection).map(({ key, label, Icon }) => (
            <DropdownMenuItem key={key} onClick={() => onSelectSection(key)} className={navMenuItemClass(tone)}>
              <Icon aria-hidden="true" className={cn("size-5", iconInk)} />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolbarIconButton
        label="Next section"
        className="rounded-[6px]"
        disabled={activeIndex === SECTION_ITEMS.length - 1}
        onClick={() => onSelectSection(SECTION_ITEMS[activeIndex + 1].key)}
      >
        <ChevronRight aria-hidden="true" className="size-5" />
      </ToolbarIconButton>
    </div>
  )
}
