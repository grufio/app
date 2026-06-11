"use client"

/**
 * Mobile-only floating bar in the top-right corner of the editor
 * canvas. Hosts the Trace-layer view-options menu (Eye) in a single
 * dark Feather-style pill. The section Edit-trigger (Pencil) was
 * removed once every surface moved its editing into the top-left "+"
 * menus — Trace is the only remaining caller and it only ever shows
 * the Eye.
 *
 * Position bar at `top-3 right-3`. When `viewOptions` is null the bar
 * renders nothing.
 *
 * The Eye's `DropdownMenu` carries three checkbox items (Trace /
 * Preview / Numbers visibility) wired to the same session-state
 * setters. Menu kept open on toggle via `e.preventDefault()` in each
 * `DropdownMenuCheckboxItem`'s `onSelect` (Radix's default is
 * close-on-select, wrong for a multi-toggle view-options menu — same
 * pattern as `components/app-card-project-menu.tsx`).
 *
 * The Eye-button picks up an `active` style while the menu is open
 * (locally tracked `menuOpen` state), so the user has a visual
 * "this control is in use" cue.
 */
import { useState } from "react"
import { Eye } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { pillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

export type MobileTopRightBarViewOptions = {
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
  numbersLayerVisible: boolean
  onTraceOverlayChange: (visible: boolean) => void
  onPreviewBitmapChange: (visible: boolean) => void
  onNumbersLayerChange: (visible: boolean) => void
}

type Props = {
  /** When null, the Eye-button is omitted and the bar renders nothing. */
  viewOptions: MobileTopRightBarViewOptions | null
  /** When true the bar stays visible on `md+` (editor surfaces in the
   * unified section model). Default false keeps the historical
   * mobile-only (`md:hidden`) behaviour for every other caller. */
  desktop?: boolean
}

export function MobileTopRightBar({ viewOptions, desktop = false }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const tone = useEditorToolbarTone()

  // Nothing to show without a view-options menu.
  if (!viewOptions) return null

  return (
    <div
      role="toolbar"
      aria-label="Editor actions"
      className={cn(
        pillClass(tone, "single"),
        "absolute top-3 right-3 z-20",
        // `md:hidden` only when NOT desktop — the unified editor surfaces
        // keep the bar on `md+`.
        desktop ? "" : "md:hidden",
      )}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <ToolbarIconButton label="View options" active={menuOpen}>
            <Eye aria-hidden="true" className="size-6" />
          </ToolbarIconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
  )
}
