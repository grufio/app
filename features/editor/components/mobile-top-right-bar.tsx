"use client"

/**
 * Floating bar in the top-right corner of the editor canvas. Hosts a
 * single dark Feather-style pill with:
 *   - a **theme toggle** (always) that flips the floating bars between
 *     the dark (`"dark"` / black) and light (`"light"` / white) tone,
 *   - the **Eye** view-options menu (only on the Trace section, when a
 *     pixelate/circulate trace exists) carrying the Trace / Preview /
 *     Numbers layer toggles.
 *
 * Position bar at `top-3 right-3`. Renders nothing only when there is
 * neither a `theme` toggle nor `viewOptions`.
 *
 * The Eye's `DropdownMenu` keeps open on toggle via `e.preventDefault()`
 * in each `DropdownMenuCheckboxItem`'s `onSelect` (Radix's default is
 * close-on-select, wrong for a multi-toggle view-options menu — same
 * pattern as `components/app-card-project-menu.tsx`). The Eye-button
 * picks up an `active` style while the menu is open.
 */
import { useState } from "react"
import { Eye, Moon, Sun } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { useEditorToolbarTone, type ToolbarTone } from "./editor-toolbar-tone"
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

export type MobileTopRightBarTheme = {
  value: ToolbarTone
  onToggle: () => void
}

type Props = {
  /** Theme toggle (always shown). When null the toggle is omitted. */
  theme?: MobileTopRightBarTheme | null
  /** Eye view-options menu (Trace section only). When null the Eye is omitted. */
  viewOptions: MobileTopRightBarViewOptions | null
  /** When true the bar stays visible on `md+` (editor surfaces in the
   * unified section model). Default false keeps the historical
   * mobile-only (`md:hidden`) behaviour for every other caller. */
  desktop?: boolean
}

export function MobileTopRightBar({ theme = null, viewOptions, desktop = false }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const tone = useEditorToolbarTone()

  // Nothing to show without a theme toggle or a view-options menu.
  if (!theme && !viewOptions) return null

  // Two controls (Eye + theme) → the `group` pill; a single one → `single`.
  const multi = Boolean(theme) && Boolean(viewOptions)

  return (
    <div
      role="toolbar"
      aria-label="Editor actions"
      className={cn(
        pillClass(tone, multi ? "group" : "single"),
        "absolute top-3 right-3 z-20",
        // `md:hidden` only when NOT desktop — the unified editor surfaces
        // keep the bar on `md+`.
        desktop ? "" : "md:hidden",
      )}
    >
      {viewOptions ? (
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
      ) : null}
      {theme ? (
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
      ) : null}
    </div>
  )
}
