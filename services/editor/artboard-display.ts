/**
 * Editor service: artboard display helpers (UI-agnostic).
 *
 * Responsibilities:
 * - Convert canonical µpx dimensions into display strings for a given unit + DPI.
 * - Keep policies for display formatting centralized and testable.
 */
import { pxUToUnitDisplay, type Unit } from "@/lib/editor/units"

export function computeArtboardSizeDisplay(args: {
  widthPxU: bigint
  heightPxU: bigint
  unit: Unit
  dpi: number
}): { width: string; height: string } | null {
  const { widthPxU, heightPxU, unit, dpi } = args
  if (!Number.isFinite(dpi) || dpi <= 0) return null
  if (widthPxU <= 0n || heightPxU <= 0n) return null
  return {
    width: pxUToUnitDisplay(widthPxU, unit, dpi),
    height: pxUToUnitDisplay(heightPxU, unit, dpi),
  }
}

