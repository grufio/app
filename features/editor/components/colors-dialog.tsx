"use client"

/**
 * Colors sheet — opened from the Trace section's floating bar (the bold
 * colour-count button under "Edit"). Shows the palette chips the current trace
 * references, reusing `PaletteColorGrid` (the same body the Colors stepper
 * section uses).
 *
 * Follows the editor sheet convention (see `TraceSheet` / `sheet-chrome`): a
 * fullscreen `absolute inset-0` overlay with a `SheetHeader` whose actions are
 * icon buttons at the TOP — no footer. Read-only, so the only action is the
 * Close (X) icon.
 */
import type { ProjectTrace } from "@/lib/api/project-trace"

import { PaletteColorGrid } from "./palette-color-grid"
import { SheetHeader } from "./sheet-chrome"
import { sheetRootClass } from "./sheet-shell"

type Props = {
  open: boolean
  onClose: () => void
  trace: ProjectTrace | null
}

export function ColorsDialog({ open, onClose, trace }: Props) {
  if (!open) return null

  // All trace kinds carry color_mode in params and snap on Munsell; default
  // "color" when missing (mirrors `ColorsSurfaceScope`).
  const traceMode: "color" | "bw" | null = (() => {
    if (!trace) return null
    const cm = (trace.params as { color_mode?: unknown }).color_mode
    return cm === "bw" ? "bw" : "color"
  })()

  return (
    <section aria-label="Colors" className={sheetRootClass()}>
      <SheetHeader title="Colors" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <PaletteColorGrid
          paletteIndicesUsed={trace?.palette_indices_used ?? null}
          traceMode={traceMode}
          hasTrace={trace != null}
        />
      </div>
    </section>
  )
}
