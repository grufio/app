"use client"

/**
 * Pixelate preview pane: a single canvas displaying the cropped,
 * quantised pixelate grid. The pane is a **fixed square** so the
 * dialog layout doesn't shift between images.
 *
 * Aspect: the canvas's CSS box uses `aspect-ratio: usedMmW / usedMmH`,
 * NOT the bitmap's cellsX × cellsY aspect — otherwise non-square
 * supercells (e.g. 6 mm × 10 mm) distort the displayed image because
 * each cell is drawn into ONE bitmap pixel regardless of its real-
 * world shape. `image-rendering: pixelated` keeps the per-cell upscale
 * sharp; `bg-muted` shows wherever the canvas doesn't reach in the
 * square pane.
 *
 * Zoom: the pane has an outer scrolling container; an inner box
 * scales with `zoom` (1.0 = square pane size). Pan is the browser's
 * built-in scroll, so we don't need any JS-side measurement.
 *
 * Source: loaded `HTMLImageElement` is fed directly to
 * `buildMiniCanvas` via `drawImage`. No scratch-canvas intermediate —
 * the previous 2000px-edge downsample threw away source detail at
 * small supercell sizes.
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
import { useSourceImage } from "@/lib/editor/trace/use-source-image"

// Zoom: 1.0 == fit-to-square-pane. 8.0 == 8× that.
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
  const source = useSourceImage(sourceImageUrl)
  const grid = useMemo(
    () => resolvePixelateGrid(displayMmW, displayMmH, params),
    [displayMmW, displayMmH, params],
  )
  const valid = isPixelateGridValid(grid)

  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zoom, setZoom] = useState(1)

  const crop = useMemo(() => {
    if (!source || !valid || displayMmW <= 0 || displayMmH <= 0) return null
    return centeredCropPixels({
      pixelW: source.naturalWidth,
      pixelH: source.naturalHeight,
      displayMmW,
      displayMmH,
      grid,
    })
  }, [source, valid, displayMmW, displayMmH, grid])

  useEffect(() => {
    const target = miniCanvasRef.current
    if (!target || !source || !crop || !valid) return
    buildMiniCanvas({
      target,
      source,
      crop,
      cellsX: grid.cellsX,
      cellsY: grid.cellsY,
      numColors: params.num_colors,
    })
  }, [source, crop, valid, grid.cellsX, grid.cellsY, params.num_colors])

  const showSpinner = !source
  const showInvalid = source !== null && !valid

  const handleZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))
  const handleFit = () => setZoom(1)
  const zoomLabel = `${Math.round(zoom * 100)}%`

  const cropAspect =
    grid.usedMmW > 0 && grid.usedMmH > 0
      ? `${grid.usedMmW} / ${grid.usedMmH}`
      : undefined

  return (
    <div
      className="relative w-full overflow-auto bg-muted"
      style={{ aspectRatio: "1 / 1" }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{
          width: `${zoom * 100}%`,
          aspectRatio: "1 / 1",
        }}
      >
        <canvas
          ref={miniCanvasRef}
          // Canvas bitmap = full source-crop resolution. buildMiniCanvas
          // paints solid cell blocks at that size — no source→cells
          // downsample touches the visible bitmap.
          width={crop ? Math.max(1, Math.round(crop.w)) : 1}
          height={crop ? Math.max(1, Math.round(crop.h)) : 1}
          className="block"
          style={{
            // Without explicit `width: 100%` the canvas falls back to
            // its intrinsic bitmap size in CSS px. The aspect-ratio +
            // max-height combo lets portrait images letterbox left/right
            // inside the square pane instead of overflowing vertically.
            width: "100%",
            maxWidth: "100%",
            maxHeight: "100%",
            aspectRatio: cropAspect,
            imageRendering: "pixelated",
          }}
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

      {source && valid ? (
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 z-10 flex justify-center">
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
