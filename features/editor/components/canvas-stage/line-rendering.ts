/**
 * Shared Konva line rendering configuration for crisp, non-interactive hairlines.
 *
 * The canonical trace-contour width lives in `device-pixel-ratio.ts`
 * (`useTraceContourStrokeCssPx` = 1 physical device pixel) — the single source
 * of truth all three applied-trace outlines consume.
 */
export function getStaticLineRenderProps(strokeWidth: number) {
  return {
    strokeWidth,
    strokeScaleEnabled: false as const,
    listening: false as const,
    perfectDrawEnabled: false as const,
    hitStrokeWidth: 0 as const,
  }
}
