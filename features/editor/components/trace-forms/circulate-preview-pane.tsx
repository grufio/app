"use client"

/**
 * Circulate preview pane: a single canvas showing the cropped source with one
 * ellipse (optionally two) painted per cell, each snapped to the Munsell
 * palette — the live mirror of the server's `/filters/circulate` output.
 *
 * Sizing/zoom/measurement are identical to `PixelatePreviewPane` (explicit-px
 * contain-fit, ResizeObserver, pinned zoom controls); see that file for the
 * layout rationale. The only difference is the renderer
 * (`buildCirculateMiniCanvas`) and the circulate grid math.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type CirculateParams } from "@/lib/editor/trace/circulate"
import {
  circulateEllipseFractions,
  isCirculateGridValid,
  resolveCirculateGrid,
} from "@/lib/editor/trace/circulate-grid-math"
import { centeredCropPixels } from "@/lib/editor/trace/pixelate-grid-math"
import { resolveInnerFilter } from "@/lib/editor/trace/inner-color-filters"
import { buildCirculateMiniCanvas } from "@/lib/editor/trace/circulate-preview"
import { useBlueNoiseLut } from "@/lib/editor/trace/use-blue-noise-lut"
import { useSourceImage } from "@/lib/editor/trace/use-source-image"
import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

// Zoom: 1.0 == fit-to-pane. 8.0 == 8× that.
const ZOOM_STEP = 1.5
const ZOOM_MIN = 1
const ZOOM_MAX = 8

type Props = {
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
  params: CirculateParams
}

export function CirculatePreviewPane({ sourceImageUrl, displayMmW, displayMmH, params }: Props) {
  const source = useSourceImage(sourceImageUrl)
  const palette = useTracePalette(params.color_mode)
  const blueNoiseLut = useBlueNoiseLut()
  const grid = useMemo(
    () => resolveCirculateGrid(displayMmW, displayMmH, params),
    [displayMmW, displayMmH, params],
  )
  const valid = isCirculateGridValid(grid)

  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const paneRef = useRef<HTMLDivElement | null>(null)
  const [pane, setPane] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setPane({ w: r.width, h: r.height })
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
    const fracs = circulateEllipseFractions(grid, params)
    // Contour mm → preview px (px-per-mm averaged over both axes), matching
    // the server handler's conversion.
    const pxPerMmX = crop.w / grid.usedMmW
    const pxPerMmY = crop.h / grid.usedMmH
    const contourPx = params.contour_width_mm * ((pxPerMmX + pxPerMmY) / 2)
    buildCirculateMiniCanvas({
      target,
      source,
      crop,
      cellsX: grid.cellsX,
      cellsY: grid.cellsY,
      outerWFrac: fracs.outerWFrac,
      outerHFrac: fracs.outerHFrac,
      innerEnabled: params.inner_enabled,
      innerWFrac: fracs.innerWFrac,
      innerHFrac: fracs.innerHFrac,
      contourPx,
      innerAdjustment: resolveInnerFilter(params.inner_filter),
      palette: palette ?? [],
      preSnapChromaScale: params.pre_snap_chroma_scale,
      numColors: params.num_colors,
      textureEnabled: params.texture_enabled,
      textureStrength: params.texture_strength,
      textureLut: blueNoiseLut,
    })
  }, [source, crop, valid, grid, params, palette, blueNoiseLut])

  const showSpinner = !source
  const showInvalid = source !== null && !valid

  const handleZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))
  const handleFit = () => setZoom(1)
  const zoomLabel = `${Math.round(zoom * 100)}%`

  const display = useMemo(() => {
    if (!valid || pane.w <= 0 || pane.h <= 0 || grid.usedMmW <= 0 || grid.usedMmH <= 0) return null
    const fitScale = Math.min(pane.w / grid.usedMmW, pane.h / grid.usedMmH)
    return {
      w: grid.usedMmW * fitScale * zoom,
      h: grid.usedMmH * fitScale * zoom,
    }
  }, [valid, pane.w, pane.h, grid.usedMmW, grid.usedMmH, zoom])

  return (
    <div ref={paneRef} className="relative w-full flex-1 min-h-0 bg-muted">
      <div className="absolute inset-0 overflow-auto">
        <div
          className="flex items-center justify-center"
          style={{ width: "fit-content", minWidth: "100%", height: "fit-content", minHeight: "100%" }}
        >
          <canvas
            ref={miniCanvasRef}
            width={crop ? Math.max(1, Math.round(crop.w)) : 1}
            height={crop ? Math.max(1, Math.round(crop.h)) : 1}
            className="block"
            style={{
              width: display?.w ?? 0,
              height: display?.h ?? 0,
              imageRendering: "pixelated",
            }}
            data-testid="circulate-preview-mini"
          />
        </div>
      </div>

      {showSpinner ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading preview…</span>
        </div>
      ) : null}
      {showInvalid ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No valid grid</span>
        </div>
      ) : null}

      {source && valid ? (
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 z-10 flex justify-center">
          <div
            className="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-background/90 px-1 py-1 shadow-md backdrop-blur"
            data-testid="circulate-preview-zoom-controls"
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleZoomOut}
              disabled={zoom <= ZOOM_MIN + 1e-6}
              aria-label="Zoom out"
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleFit}
              disabled={Math.abs(zoom - 1) < 1e-6}
              aria-label="Fit"
            >
              <Maximize2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleZoomIn}
              disabled={zoom >= ZOOM_MAX - 1e-6}
              aria-label="Zoom in"
            >
              <ZoomIn className="size-4" />
            </Button>
            <span
              className="px-2 text-xs tabular-nums text-muted-foreground"
              data-testid="circulate-preview-zoom-label"
            >
              {zoomLabel}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
