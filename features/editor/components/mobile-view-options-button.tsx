"use client"

/**
 * Floating View-Options button — mobile-only, sits left of the
 * `MobileEditButton` on the editor canvas. Trigger opens a
 * `DropdownMenu` with three layer-visibility checkboxes
 * (Trace / Preview / Numbers) bound to the session-state setters
 * already exposed by the Trace surface scope.
 *
 * Same visual sprache as `MobileEditButton`: round `size-10` button,
 * white background, drop-shadow, thin ring. Position: `absolute
 * top-3 right-16` (4rem from the right → ~0.75rem gap to the Edit
 * FAB at `right-3`).
 *
 * `onSelect={(e) => e.preventDefault()}` on each `CheckboxItem`
 * keeps the menu open across toggles. Radix's default is
 * close-on-select; for a multi-toggle view-options menu that's
 * wrong (same pattern as `app-card-project-menu.tsx`).
 *
 * Caller is responsible for the active-trace gate: only render
 * this when a Pixelate or Circulate trace has actually been
 * applied (the three layers Lineart's vtracer output doesn't
 * carry `<g id="colors">` / `<g id="cells">` / `<g id="numbers">`
 * groups, so the toggles would be no-ops there).
 */
import { Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Props = {
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
  numbersLayerVisible: boolean
  onTraceOverlayChange: (visible: boolean) => void
  onPreviewBitmapChange: (visible: boolean) => void
  onNumbersLayerChange: (visible: boolean) => void
}

export function MobileViewOptionsButton({
  traceOverlayVisible,
  previewBitmapVisible,
  numbersLayerVisible,
  onTraceOverlayChange,
  onPreviewBitmapChange,
  onNumbersLayerChange,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          aria-label="View options"
          className="absolute top-3 right-16 z-20 inline-flex size-10 items-center justify-center rounded-full border border-white bg-white p-0 text-foreground shadow-md ring-1 ring-black/10 transition-transform active:scale-95 hover:bg-white md:hidden"
        >
          <Eye aria-hidden="true" className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={traceOverlayVisible}
          onCheckedChange={onTraceOverlayChange}
          onSelect={(e) => e.preventDefault()}
        >
          Trace
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={previewBitmapVisible}
          onCheckedChange={onPreviewBitmapChange}
          onSelect={(e) => e.preventDefault()}
        >
          Preview
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={numbersLayerVisible}
          onCheckedChange={onNumbersLayerChange}
          onSelect={(e) => e.preventDefault()}
        >
          Numbers
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
