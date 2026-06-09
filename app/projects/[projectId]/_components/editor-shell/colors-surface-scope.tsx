"use client"

/**
 * Mobile-only scope for the colors surface. The Colors section has no
 * canvas view of its own — the Sheet IS the surface, mounted
 * immediately when the user picks Colors in the top-left bar.
 *
 * Because the sheet (`z-30`) buries the top bars (`z-20`), the X close
 * button in the sheet header navigates BACK to the Artboard section
 * (via `onClose`) — that's the only way out of Colors without the
 * top bars on top.
 */
import { MobileColorsSheet } from "@/features/editor/components/mobile-colors-sheet"
import type { ProjectTrace } from "@/lib/api/project-trace"

export type ColorsSurfaceScopeProps = {
  trace: ProjectTrace | null
  /** Called when the user taps the sheet's Close button. The shell
   * wires this to switching back to a section whose top bars are
   * usable (Artboard by default). */
  onClose: () => void
}

export function ColorsSurfaceScope({ trace, onClose }: ColorsSurfaceScopeProps) {
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
      onClose={onClose}
    />
  )
}
