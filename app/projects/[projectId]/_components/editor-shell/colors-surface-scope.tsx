"use client"

/**
 * Mobile-only scope for the colors surface.
 *
 * Colors is a regular section view (NOT a dialog) — the palette is
 * the surface and the floating `EditorTopLeftBar` stays visible above
 * it so the user can switch to Image / Filter / Trace at any time.
 * There's no Edit affordance because Colors has nothing to edit; the
 * `MobileTopRightBar` (Pencil) is intentionally absent.
 */
import { MobileColorsSheet } from "@/features/editor/components/mobile-colors-sheet"
import type { ProjectTrace } from "@/lib/api/project-trace"

export type ColorsSurfaceScopeProps = {
  trace: ProjectTrace | null
}

export function ColorsSurfaceScope({ trace }: ColorsSurfaceScopeProps) {
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
    <MobileColorsSheet
      paletteIndicesUsed={trace?.palette_indices_used ?? null}
      traceMode={traceMode}
      hasTrace={trace != null}
    />
  )
}
