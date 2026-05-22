/**
 * Resolves the image's displayed size on the artboard (in mm) for the
 * Trace dialog + preview.
 *
 * Source preference (unchanged behaviour, extracted from
 * ProjectEditorShell so it is unit-testable in isolation):
 *   1. the live canvas-tx mirror (`imageTxU`) — reflects drag/resize,
 *   2. else the SSR-seeded transform (`initialImageTxU`) — fresh-upload
 *      fallback before the canvas reports its first frame,
 *   3. else the same first-placement the upload flow uses
 *      (`computeImagePlacementPx` on the master intrinsic).
 *
 * NOTE: branch (3) silently falls back to the master-intrinsic aspect
 * (1:1 for a square master). When the live + seeded transforms are both
 * empty — e.g. after a transient mirror reset — the dialog therefore
 * shows the intrinsic size, not the user's resize. That fallback policy
 * is the structural fragility tracked in
 * `output/review/review_pixelate-aspect.md` (WS-3); this extraction
 * preserves the current behaviour and pins it under test so any future
 * policy change is a deliberate, tested edit.
 */
import { computeImagePlacementPx } from "@/lib/editor/image-placement"
import { GEOMETRY_PPI } from "@/lib/editor/units"

const MM_PER_INCH = 25.4

type TxDims = { w: bigint; h: bigint } | null | undefined

export type TraceDisplayMm = { displayMmW: number; displayMmH: number }

export function resolveTraceDisplayMm(args: {
  imageTxU: TxDims
  initialImageTxU: TxDims
  artboardWidthPx: number | null | undefined
  artboardHeightPx: number | null | undefined
  intrinsicW: number
  intrinsicH: number
  imageDpi?: number | null
}): TraceDisplayMm | null {
  const {
    imageTxU,
    initialImageTxU,
    artboardWidthPx,
    artboardHeightPx,
    intrinsicW,
    intrinsicH,
    imageDpi,
  } = args

  if (!artboardWidthPx || !artboardHeightPx) return null

  // (1)/(2) live mirror, then SSR seed.
  const liveW = imageTxU?.w ?? initialImageTxU?.w
  const liveH = imageTxU?.h ?? initialImageTxU?.h
  if (liveW && liveH) {
    return {
      displayMmW: (Number(liveW) / 1e6 / GEOMETRY_PPI) * MM_PER_INCH,
      displayMmH: (Number(liveH) / 1e6 / GEOMETRY_PPI) * MM_PER_INCH,
    }
  }

  // (3) first-placement fallback on the master intrinsic.
  const placement = computeImagePlacementPx({
    artW: artboardWidthPx,
    artH: artboardHeightPx,
    intrinsicW,
    intrinsicH,
    imageDpi: imageDpi ?? null,
  })
  if (!placement) return null
  return {
    displayMmW: (placement.widthPx / GEOMETRY_PPI) * MM_PER_INCH,
    displayMmH: (placement.heightPx / GEOMETRY_PPI) * MM_PER_INCH,
  }
}
