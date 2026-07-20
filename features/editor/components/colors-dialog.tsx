"use client"

/**
 * Colors dialog — opened from the Trace section's floating bar (the bold
 * colour-count button under "Edit"). Shows the palette chips the current trace
 * references, reusing `PaletteColorGrid` (the same body the Colors stepper
 * section uses). Fullscreen sheet with a sticky Close footer — mirrors
 * `TraceSelectionController`.
 */
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogStickyFooter,
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
      {/* The sticky footer's Close button is the single dismiss affordance —
          drop the default corner X so there aren't two "Close" controls. */}
      <DialogContent variant="fullscreen" showCloseButton={false}>
        <DialogHeader className="shrink-0 border-b p-4">
          <DialogTitle>Colors</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <PaletteColorGrid
            paletteIndicesUsed={trace?.palette_indices_used ?? null}
            traceMode={traceMode}
            hasTrace={trace != null}
          />
        </div>
        <DialogStickyFooter>
          <Button size="lg" onClick={onClose}>
            Close
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  )
}
