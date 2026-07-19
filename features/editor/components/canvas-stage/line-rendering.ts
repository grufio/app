/**
 * Shared Konva line rendering configuration for crisp, non-interactive hairlines.
 */

/**
 * Canonical trace-region CONTOUR width — a constant 1 CSS pixel, non-scaling.
 * Single source of truth shared by every applied-trace outline: the pixelate
 * grid + circulate frames (Konva) and the linerate region outlines (DOM SVG).
 *
 * Why 1 CSS px and not `1/dpr`: the outline renders on two substrates with
 * different behaviour. Konva lines are device-pixel-snapped, so a `1/dpr`
 * hairline lands crisp on one physical pixel — but the linerate DOM SVG cannot
 * be pixel-snapped (it's browser-stretched), so a `1/dpr` (sub-CSS-pixel)
 * stroke there antialiases into a faint grey line. At a full 1 CSS pixel both
 * substrates render the same solid hairline, so the three trace kinds stay
 * consistent (and it matches the artboard grid/border, which is also 1).
 *
 * Keeping the width here — instead of `1/dpr` inlined at three call sites —
 * is what prevents the outline from silently diverging again.
 */
export const TRACE_CONTOUR_STROKE_CSS_PX = 1

export function getStaticLineRenderProps(strokeWidth: number) {
  return {
    strokeWidth,
    strokeScaleEnabled: false as const,
    listening: false as const,
    perfectDrawEnabled: false as const,
    hitStrokeWidth: 0 as const,
  }
}
