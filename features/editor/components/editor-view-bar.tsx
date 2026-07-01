"use client"

/**
 * view bar — the dark/light tone toggle + the Eye view-options menu (top-left).
 * Rendered inside the shell's top-left pill stack, below the home bar. More
 * controls may land here later. Tone from the `EditorToolbarTone` context.
 */
import { useState } from "react"
import { Eye, Moon, Sun } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { useEditorToolbarTone, type ToolbarTone } from "./editor-toolbar-tone"
import { pillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

export type EditorViewBarViewOptions = {
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
  numbersLayerVisible: boolean
  onTraceOverlayChange: (visible: boolean) => void
  onPreviewBitmapChange: (visible: boolean) => void
  onNumbersLayerChange: (visible: boolean) => void
}

type Props = {
  /** Dark/light tone toggle, rendered as a pill in the top-left stack. */
  theme: { value: ToolbarTone; onToggle: () => void }
  /** Eye view-options menu (Trace section only). Null → no Eye pill. */
  viewOptions?: EditorViewBarViewOptions | null
}

export function EditorViewBar({ theme, viewOptions = null }: Props) {
  const tone = useEditorToolbarTone()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
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
    </>
  )
}
