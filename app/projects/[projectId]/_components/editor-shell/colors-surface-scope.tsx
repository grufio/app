"use client"

/**
 * Mobile-only scope for the colors surface.
 *
 * Colors is a regular section view (NOT a dialog) — the palette is
 * the surface and the floating `EditorTopLeftBar` stays visible above
 * it so the user can switch to Image / Filter / Trace at any time.
 * There's no Edit affordance because Colors has nothing to edit; the
 * `EditorTopRightBar` (Pencil) is intentionally absent.
 */
import { ColorsSheet } from "@/features/editor/components/colors-sheet"
import type { ProjectTrace } from "@/lib/api/project-trace"

export type ColorsSurfaceScopeProps = {
  trace: ProjectTrace | null
  /** When true, the Colors section view stays visible on `md+`. */
  desktop?: boolean
}

export function ColorsSurfaceScope({ trace, desktop }: ColorsSurfaceScopeProps) {
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
    <ColorsSheet
      desktop={desktop}
      paletteIndicesUsed={trace?.palette_indices_used ?? null}
      traceMode={traceMode}
      hasTrace={trace != null}
    />
  )
}
