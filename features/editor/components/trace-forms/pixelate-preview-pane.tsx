"use client"

/**
 * Pixelate preview pane: a single canvas displaying the cropped,
 * quantised pixelate grid. The pane is a **fixed square** so the
 * dialog layout doesn't shift between images.
 *
 * Sizing — explicit pixels, no CSS `aspect-ratio`. The pane is measured
 * with a ResizeObserver (`paneSize`, square). The displayed canvas size
 * is computed directly: fit the display geometry (`usedMmW × usedMmH`)
 * into the square pane by its larger side, then multiply by `zoom`, and
 * set `width`/`height` in px on the canvas. We size by display-mm, NOT by
 * the bitmap's cellsX × cellsY aspect — otherwise non-square supercells
 * (e.g. 6 mm × 10 mm) would distort, because each cell is drawn into ONE
 * bitmap pixel regardless of its real-world shape. The near-square bitmap
 * is deliberately stretched to that px box. `image-rendering: pixelated`
 * keeps the per-cell upscale sharp; `bg-muted` shows wherever the canvas
 * doesn't reach in the square pane.
 *
 * Why explicit px and not `aspect-ratio`: a derived `aspect-ratio` value
 * combined with `width:100%`/`maxHeight:100%` over-constrains the box and
 * a portrait shape overflows the square pane (percentage height can't cap
 * because the parent has no definite height). Computing the px size from
 * the measured pane removes that indirection — the same explicit-px model
 * the trace overlay uses (`trace-inline-svg.tsx`).
 *
 * Zoom: the pane scrolls (`overflow-auto`); `zoom` scales the computed px
 * size. An inner wrapper is `fit-content` but at least pane-size
 * (`min-w/h: 100%`) and flex-centers the canvas, so the canvas is centered
 * when smaller than the pane and scrolls from the top-left when larger.
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
  const paneRef = useRef<HTMLDivElement | null>(null)
  const [paneSize, setPaneSize] = useState(0)
  const [zoom, setZoom] = useState(1)

  // Measure the (square) pane in CSS px. The pane is `w-full`, so its
  // width is driven by the dialog layout; we mirror it onto the height
  // below to keep the frame square. Observing width and setting height
  // can't loop — height never feeds back into width.
  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setPaneSize(entries[0]?.contentRect.width ?? 0)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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

  // Displayed canvas size in CSS px: fit the display geometry into the
  // square pane by its larger side, then apply zoom. zoom === 1 fits;
  // zoom > 1 grows past the pane and the pane scrolls. Null until the
  // pane is measured or the grid is invalid → canvas collapses to 0.
  const display = useMemo(() => {
    if (!valid || paneSize <= 0 || grid.usedMmW <= 0 || grid.usedMmH <= 0) return null
    const fitScale = paneSize / Math.max(grid.usedMmW, grid.usedMmH)
    return {
      w: grid.usedMmW * fitScale * zoom,
      h: grid.usedMmH * fitScale * zoom,
    }
  }, [valid, paneSize, grid.usedMmW, grid.usedMmH, zoom])

  return (
    <div
      ref={paneRef}
      className="relative w-full overflow-auto bg-muted"
      style={{ height: paneSize || undefined }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: "fit-content",
          minWidth: "100%",
          height: "fit-content",
          minHeight: "100%",
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
            // Explicit px box from the measured pane (no aspect-ratio).
            // The near-square bitmap stretches to fill it.
            width: display?.w ?? 0,
            height: display?.h ?? 0,
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
