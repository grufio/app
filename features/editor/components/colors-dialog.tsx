"use client"

/**
 * Colors dialog — opened from the Trace section's floating bar (the bold
 * colour-count button under "Edit"). Shows the palette chips the current trace
 * references, reusing `PaletteColorGrid` (the same body the Colors stepper
 * section uses).
 *
 * Read-only: the only action is dismiss, which — per the editor's dialog
 * convention — lives at the TOP (the corner close button), no sticky footer.
 * Fullscreen sheet so a long palette scrolls.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ProjectTrace } from "@/lib/api/project-trace"

import { PaletteColorGrid } from "./palette-color-grid"

type Props = {
  open: boolean
  onClose: () => void
  trace: ProjectTrace | null
}

export function ColorsDialog({ open, onClose, trace }: Props) {
  // All trace kinds carry color_mode in params and snap on Munsell; default
  // "color" when missing (mirrors `ColorsSurfaceScope`).
  const traceMode: "color" | "bw" | null = (() => {
    if (!trace) return null
    const cm = (trace.params as { color_mode?: unknown }).color_mode
    return cm === "bw" ? "bw" : "color"
  })()

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      {/* `pr-12` keeps the title clear of the top-right close button. */}
      <DialogContent variant="fullscreen">
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>Colors</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <PaletteColorGrid
            paletteIndicesUsed={trace?.palette_indices_used ?? null}
            traceMode={traceMode}
            hasTrace={trace != null}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
