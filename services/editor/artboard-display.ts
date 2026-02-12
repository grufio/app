/**
 * Editor service: artboard display helpers (UI-agnostic).
 *
 * Responsibilities:
 * - Convert canonical µpx dimensions into display strings for a given unit + DPI.
 * - Keep policies for display formatting centralized and testable.
 */
import { pxUToUnitDisplayFixed, type Unit } from "@/lib/editor/units"

export function computeArtboardSizeDisplay(args: {
  widthPxU: bigint
  heightPxU: bigint
  unit: Unit
}): { width: string; height: string } | null {
  const { widthPxU, heightPxU, unit } = args
  if (widthPxU <= 0n || heightPxU <= 0n) return null
  return {
    width: pxUToUnitDisplayFixed(widthPxU, unit),
    height: pxUToUnitDisplayFixed(heightPxU, unit),
  }
}

