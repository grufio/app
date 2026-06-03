"use client"

/**
 * Mobile-only scope for the colors surface. The Colors section has no
 * floating Edit-button + Sheet flow (unlike artboard/filter/trace) —
 * tapping the bottom-nav's Colors icon mounts this scope, and the
 * Sheet IS the surface. So the scope is a thin wrapper that derives
 * the sheet's props from the active trace.
 *
 * Mounted only when `isMobile && mobileSection === "colors"`. Lives
 * here next to its siblings (artboard/filter/trace surface scopes)
 * so the directory shape mirrors the four mobile sections.
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
