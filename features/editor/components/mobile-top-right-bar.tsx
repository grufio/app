"use client"

/**
 * Mobile-only floating bar in the top-right corner of the editor
 * canvas. Combines the section's Edit-trigger (Pencil) with the
 * Trace-layer view-options menu (Eye) when applicable, in a single
 * dark Feather-style pill. Replaces the prior pair of standalone
 * round white FABs (`MobileEditButton` + `MobileViewOptionsButton`).
 *
 * Position bar at `top-3 right-3` — same spot the Edit-FAB sat
 * before — so the user's muscle memory for "tap top-right to manage
 * the current section" carries over. The Eye sits to the left of
 * the Pencil inside the bar.
 *
 * Both buttons are independently optional:
 *   - `onEditTap` omitted → no Pencil (e.g. Trace, where the "+" sub-pill
 *     opens the kind picker and the configure dialog owns Delete, so the
 *     Edit trigger is redundant).
 *   - `viewOptions` null → no Eye.
 *   - neither present → the bar renders nothing.
 * The Eye's `DropdownMenu` carries three checkbox items (Trace / Preview /
 * Numbers visibility) wired to the same session-state setters.
 *
 * Menu kept open on toggle via `e.preventDefault()` in each
 * `DropdownMenuCheckboxItem`'s `onSelect` (Radix's default is
 * close-on-select, wrong for a multi-toggle view-options menu —
 * same pattern as `components/app-card-project-menu.tsx`).
 *
 * The Eye-button picks up an `active` style while the menu is open
 * (locally tracked `menuOpen` state), so the user has a visual
 * "this control is in use" cue.
 */
import { useState } from "react"
import { Eye, Pencil } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
  /** When omitted, the Edit (Pencil) button is not rendered. */
  onEditTap?: () => void
  /** Aria label for the Edit-button; section-specific ("Edit trace"
   * etc.) so screen readers announce which surface the tap opens. */
  ariaLabelEdit?: string
  /** When null, the Eye-button is omitted from the bar. */
  viewOptions: MobileTopRightBarViewOptions | null
  /** When true the bar stays visible on `md+` (editor surfaces in the
   * unified section model). Default false keeps the historical
   * mobile-only (`md:hidden`) behaviour for every other caller. */
  desktop?: boolean
}

export function MobileTopRightBar({ onEditTap, ariaLabelEdit = "Edit", viewOptions, desktop = false }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  // Nothing to show without an Edit trigger or a view-options menu.
  if (!onEditTap && !viewOptions) return null

  // Two buttons → match the bottom floating-toolbar's `gap-3 px-2 py-1`.
  // A single button → `p-1` (40 × 40 square).
  const multi = Boolean(viewOptions) && Boolean(onEditTap)

  return (
    <div
      role="toolbar"
      aria-label="Editor actions"
      className={
        // `md:hidden` only when NOT desktop — the unified editor surfaces
        // keep the bar on `md+`.
        [
          "absolute top-3 right-3 z-20 inline-flex items-center rounded-lg bg-zinc-900/95 shadow-lg ring-1 ring-white/10 backdrop-blur",
          multi ? "gap-3 px-2 py-1" : "p-1",
          desktop ? "" : "md:hidden",
        ]
          .filter(Boolean)
          .join(" ")
      }
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
      {onEditTap ? (
        <ToolbarIconButton label={ariaLabelEdit} onClick={onEditTap}>
          <Pencil aria-hidden="true" className="size-6" />
        </ToolbarIconButton>
      ) : null}
    </div>
  )
}
