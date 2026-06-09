"use client"

/**
 * Mobile-only scope for the colors surface. Mirrors the
 * artboard/filter/trace pattern:
 *
 *   - `MobileTopRightBar` with an Edit (Pencil) button is always
 *     mounted while the section is active
 *   - The colors Sheet only opens after the user taps Edit, and
 *     closes via its own X — same as the other sections
 *
 * Earlier this scope auto-mounted the sheet immediately so the sheet
 * IS the surface. That broke once the floating top bars dropped to
 * `z-20` (under the sheet's `z-30`) — there was no Edit / Close
 * affordance to escape Colors. Symmetric behaviour with the other
 * sections fixes it without special-casing z-indexes.
 */
import { useState } from "react"

import { MobileColorsSheet } from "@/features/editor/components/mobile-colors-sheet"
import { MobileTopRightBar } from "@/features/editor/components/mobile-top-right-bar"
import type { ProjectTrace } from "@/lib/api/project-trace"

export type ColorsSurfaceScopeProps = {
  trace: ProjectTrace | null
}

export function ColorsSurfaceScope({ trace }: ColorsSurfaceScopeProps) {
  const [editOpen, setEditOpen] = useState(false)

  // All three trace kinds (pixelate, circulate, lineart) carry
  // color_mode in params and snap on Munsell. Default "color" when
  // missing (pre-snap legacy rows never reach this branch — they have
  // palette_indices_used=null and short-circuit to the "re-run" empty
  // state inside the sheet).
  const traceMode: "color" | "bw" | null = (() => {
    if (!trace) return null
    const cm = (trace.params as { color_mode?: unknown }).color_mode
    return cm === "bw" ? "bw" : "color"
  })()

  return (
    <>
      <MobileTopRightBar
        onEditTap={() => setEditOpen(true)}
        ariaLabelEdit="Edit colors"
        viewOptions={null}
      />
      {editOpen ? (
        <MobileColorsSheet
          paletteIndicesUsed={trace?.palette_indices_used ?? null}
          traceMode={traceMode}
          hasTrace={trace != null}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </>
  )
}
