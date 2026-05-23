/**
 * Convert the authoritative display transform (µpx) into the image's
 * displayed size on the artboard in millimetres, for the Trace dialog +
 * preview (pixelate-grid math runs on display-mm, not source-px).
 *
 * This replaces the former `resolve-trace-display-mm.ts`, whose
 * preference chain (`imageTxU ?? initialImageTxU ?? master-intrinsic`)
 * hid a silent intrinsic fallback (F1): when both mirrors were empty —
 * e.g. after a transient reset — the dialog showed the master-intrinsic
 * aspect instead of the user's resize. With Invariant 1 there is exactly
 * one source (`displayTxU`); there is nothing to fall back to. When the
 * source is null (genuine fresh upload, no persisted state) the result is
 * null and the caller declines to open the trace dialog until the canvas
 * has placed the image — the size is read from the one source, never
 * re-derived from the intrinsic.
 */
import { GEOMETRY_PPI } from "@/lib/editor/units"

const MM_PER_INCH = 25.4

export type TraceDisplayMm = { displayMmW: number; displayMmH: number }

export function displayTxToMm(args: {
  displayTxU: { w: bigint; h: bigint } | null | undefined
  artboardWidthPx: number | null | undefined
  artboardHeightPx: number | null | undefined
}): TraceDisplayMm | null {
  const { displayTxU, artboardWidthPx, artboardHeightPx } = args
  if (!artboardWidthPx || !artboardHeightPx) return null
  if (!displayTxU?.w || !displayTxU?.h) return null
  return {
    displayMmW: (Number(displayTxU.w) / 1e6 / GEOMETRY_PPI) * MM_PER_INCH,
    displayMmH: (Number(displayTxU.h) / 1e6 / GEOMETRY_PPI) * MM_PER_INCH,
  }
}
