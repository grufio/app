"use client"

/**
 * Pixelate preview pane: a single canvas displaying the cropped,
 * quantised pixelate grid. CSS `image-rendering: pixelated` does the
 * nearest-neighbour upscale; the pane's CSS `aspect-ratio` matches
 * the image so the canvas fills the pane completely — no letterbox.
 *
 * Zoom: the pane has an outer scrolling container; the canvas's CSS
 * width grows with `zoom` (1.0 = fits the pane). Pan is the browser's
 * built-in scroll, so we don't need any JS-side measurement.
 *
 * Inputs are reactive: when `params` changes, the mini canvas is
 * redrawn in-place (React owns its `width`/`height` attributes via
 * JSX props, so the bitmap clears + redraws cleanly).
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  centeredCropPixels,
  isPixelateGridValid,
  resolvePixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"
import { type PixelateParams } from "@/lib/editor/trace/pixelate"
import { buildMiniCanvas } from "@/lib/editor/trace/pixelate-preview"
import { useScratchCanvas } from "@/lib/editor/trace/use-scratch-canvas"

const SCRATCH_MAX_EDGE = 2000

// Zoom: 1.0 == fit-to-pane (canvas fills pane width). 4.0 == 4× that.
const ZOOM_STEP = 1.5
const ZOOM_MIN = 1
const ZOOM_MAX = 8

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
  const [zoom, setZoom] = useState(1)

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

  const aspectRatio =
    displayMmW > 0 && displayMmH > 0 ? `${displayMmW} / ${displayMmH}` : undefined

  const handleZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))
  const handleFit = () => setZoom(1)
  const zoomLabel = `${Math.round(zoom * 100)}%`

  return (
    <div
      className="relative w-full overflow-auto bg-muted"
      style={{ aspectRatio }}
    >
      <div
        className="relative"
        style={{
          width: `${zoom * 100}%`,
          aspectRatio,
        }}
      >
        <canvas
          ref={miniCanvasRef}
          width={grid.cellsX || 1}
          height={grid.cellsY || 1}
          className="block size-full"
          style={{ imageRendering: "pixelated" }}
          data-testid="pixelate-preview-mini"
        />
      </div>
      {showSpinner ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Vorschau wird geladen…</span>
        </div>
      ) : null}
      {showInvalid ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">Keine gültige Aufteilung</span>
        </div>
      ) : null}

      {scratch && valid ? (
        <div className="pointer-events-none sticky bottom-2 left-0 right-0 flex justify-center">
          <div
            className="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-background/90 px-1 py-1 shadow-md backdrop-blur"
            data-testid="pixelate-preview-zoom-controls"
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleZoomOut}
              disabled={zoom <= ZOOM_MIN + 1e-6}
              aria-label="Verkleinern"
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleFit}
              disabled={Math.abs(zoom - 1) < 1e-6}
              aria-label="Einpassen"
            >
              <Maximize2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleZoomIn}
              disabled={zoom >= ZOOM_MAX - 1e-6}
              aria-label="Vergrößern"
            >
              <ZoomIn className="size-4" />
            </Button>
            <span className="px-2 text-xs tabular-nums text-muted-foreground" data-testid="pixelate-preview-zoom-label">
              {zoomLabel}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
