/**
 * Editor service: grid validation (UI-agnostic).
 *
 * Responsibilities:
 * - Convert possibly-null hook outputs into a renderable grid model (or `null`).
 * - Preserve UI semantics: require finite positive numbers.
 */
import type { ProjectGridRow } from "./types"

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
  const { row, spacingXPx, spacingYPx, lineWidthPx } = opts
  if (!row) return null

  // Preserve existing guard behavior (use NaN fallback).
  if (!Number.isFinite(spacingXPx ?? NaN) || !Number.isFinite(spacingYPx ?? NaN) || !Number.isFinite(lineWidthPx ?? NaN)) return null

  const spacingX = Number(spacingXPx)
  const spacingY = Number(spacingYPx)
  const lw = Number(lineWidthPx)
  if (spacingX <= 0 || spacingY <= 0 || lw <= 0) return null

  return { spacingXPx: spacingX, spacingYPx: spacingY, lineWidthPx: lw, color: row.color }
}

