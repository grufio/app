/**
 * Editor service: grid validation (UI-agnostic).
 *
 * Responsibilities:
 * - Convert possibly-null hook outputs into a renderable grid model (or `null`).
 * - Preserve UI semantics: require finite positive numbers.
 */
import type { ProjectGridRow } from "./types"
import { computeRgbaBackgroundStyleFromHex } from "@/lib/editor/color"

export type RenderableGrid = {
  spacingXPx: number
  spacingYPx: number
  lineWidthPx: number
  color: string
}

export function computeRenderableGrid(opts: {
  row: ProjectGridRow | null
  spacingXPx: number | null | undefined
  spacingYPx: number | null | undefined
  lineWidthPx: number | null | undefined
}): RenderableGrid | null {
  const { row, spacingXPx, spacingYPx } = opts
  if (!row) return null

  // Preserve existing guard behavior (use NaN fallback) for spacing.
  if (!Number.isFinite(spacingXPx ?? NaN) || !Number.isFinite(spacingYPx ?? NaN)) return null

  const spacingX = Number(spacingXPx)
  const spacingY = Number(spacingYPx)
  if (spacingX <= 0 || spacingY <= 0) return null

  const opacityPercent = Math.max(0, Math.min(100, Number(row.line_width_value)))
  const rgba = computeRgbaBackgroundStyleFromHex({
    enabled: true,
    hex: row.color,
    opacityPercent,
  })
  const strokeColor = rgba?.backgroundColor ?? row.color

  // Grid lines are rendered as a fixed 1px hairline for consistent sharpness.
  return { spacingXPx: spacingX, spacingYPx: spacingY, lineWidthPx: 1, color: strokeColor }
}

