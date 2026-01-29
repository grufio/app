/**
 * Editor service: image sizing helpers (UI-agnostic).
 *
 * Responsibilities:
 * - Convert user-entered size values (unit + DPI) into canonical µpx (BigInt).
 * - Apply proportional scaling policies using canonical µpx ratios.
 *
 * Notes:
 * - This module is intentionally UI-agnostic (no React state, no DOM assumptions).
 */
import { divRoundHalfUp, pxUToUnitDisplay, type Unit, unitToPxU } from "@/lib/editor/units"

export type MicroPxRatio = { wPxU: bigint; hPxU: bigint }

export function parseMicroPxFromUnitInput(input: string, unit: Unit, dpi: number): bigint | null {
  if (!Number.isFinite(dpi) || dpi <= 0) return null
  const s = String(input ?? "").trim()
  if (!s) return null
  try {
    const v = unitToPxU(s, unit, dpi)
    if (v <= 0n) return null
    return v
  } catch {
    return null
  }
}

export function parseAndClampImageSize(args: {
  draftW: string
  draftH: string
  unit: Unit
  dpi: number
}): { wPxU: bigint; hPxU: bigint } | null {
  const wPxU = parseMicroPxFromUnitInput(args.draftW, args.unit, args.dpi)
  const hPxU = parseMicroPxFromUnitInput(args.draftH, args.unit, args.dpi)
  if (!wPxU || !hPxU) return null
  return { wPxU, hPxU }
}

export function computeLockedAspectOtherDimensionFromWidthInput(args: {
  nextWidthInput: string
  unit: Unit
  dpi: number
  ratio: MicroPxRatio
}): { nextHeightPxU: bigint; nextHeightDisplay: string } | null {
  const { ratio } = args
  if (ratio.wPxU <= 0n || ratio.hPxU <= 0n) return null

  const wPxU = parseMicroPxFromUnitInput(args.nextWidthInput, args.unit, args.dpi)
  if (!wPxU) return null

  const nextHPxU = divRoundHalfUp(wPxU * ratio.hPxU, ratio.wPxU)
  if (nextHPxU <= 0n) return null
  return { nextHeightPxU: nextHPxU, nextHeightDisplay: pxUToUnitDisplay(nextHPxU, args.unit, args.dpi) }
}

export function computeLockedAspectOtherDimensionFromHeightInput(args: {
  nextHeightInput: string
  unit: Unit
  dpi: number
  ratio: MicroPxRatio
}): { nextWidthPxU: bigint; nextWidthDisplay: string } | null {
  const { ratio } = args
  if (ratio.wPxU <= 0n || ratio.hPxU <= 0n) return null

  const hPxU = parseMicroPxFromUnitInput(args.nextHeightInput, args.unit, args.dpi)
  if (!hPxU) return null

  const nextWPxU = divRoundHalfUp(hPxU * ratio.wPxU, ratio.hPxU)
  if (nextWPxU <= 0n) return null
  return { nextWidthPxU: nextWPxU, nextWidthDisplay: pxUToUnitDisplay(nextWPxU, args.unit, args.dpi) }
}

