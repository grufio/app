"use client"

/**
 * Pixelate preview pane: a single canvas displaying the cropped,
 * quantised pixelate grid. CSS `image-rendering: pixelated` does the
 * nearest-neighbour upscale, `object-fit: contain` handles aspect
 * letterboxing — no JS-side measurement of the pane size.
 *
 * Inputs are reactive: when `params` changes, the mini canvas is
 * redrawn in-place (React owns its `width`/`height` attributes via
 * JSX props, so the bitmap clears + redraws cleanly).
 */
import { useEffect, useMemo, useRef } from "react"
import { Loader2 } from "lucide-react"

import {
  centeredCropPixels,
  isPixelateGridValid,
  resolvePixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"
import { type PixelateParams } from "@/lib/editor/trace/pixelate"
import { buildMiniCanvas } from "@/lib/editor/trace/pixelate-preview"
import { useScratchCanvas } from "@/lib/editor/trace/use-scratch-canvas"

const SCRATCH_MAX_EDGE = 2000

type Props = {
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
  params: PixelateParams
}

export function PixelatePreviewPane({ sourceImageUrl, displayMmW, displayMmH, params }: Props) {
  const scratch = useScratchCanvas(sourceImageUrl, SCRATCH_MAX_EDGE)
  const grid = useMemo(
    () => resolvePixelateGrid(displayMmW, displayMmH, params),
    [displayMmW, displayMmH, params],
  )
  const valid = isPixelateGridValid(grid)

  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const crop = useMemo(() => {
    if (!scratch || !valid || displayMmW <= 0 || displayMmH <= 0) return null
    return centeredCropPixels({
      pixelW: scratch.width,
      pixelH: scratch.height,
      displayMmW,
      displayMmH,
      grid,
    })
  }, [scratch, valid, displayMmW, displayMmH, grid])

  useEffect(() => {
    const target = miniCanvasRef.current
    if (!target || !scratch || !crop || !valid) return
    buildMiniCanvas({
      target,
      scratch,
      crop,
      cellsX: grid.cellsX,
      cellsY: grid.cellsY,
      numColors: params.num_colors,
    })
  }, [scratch, crop, valid, grid.cellsX, grid.cellsY, params.num_colors])

  const showSpinner = !scratch
  const showInvalid = scratch !== null && !valid

  return (
    <div className="relative flex flex-1 overflow-hidden bg-muted">
      <canvas
        ref={miniCanvasRef}
        width={grid.cellsX || 1}
        height={grid.cellsY || 1}
        className="block size-full"
        style={{ objectFit: "contain", imageRendering: "pixelated" }}
        data-testid="pixelate-preview-mini"
      />
      {showSpinner ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Vorschau wird geladen…</span>
        </div>
      ) : null}
      {showInvalid ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Keine gültige Aufteilung</span>
        </div>
      ) : null}
    </div>
  )
}
