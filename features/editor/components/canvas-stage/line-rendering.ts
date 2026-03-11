/**
 * Shared Konva line rendering configuration for crisp, non-interactive hairlines.
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
