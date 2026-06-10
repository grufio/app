"use client"

/**
 * Circulate preview pane: a single canvas showing the cropped source with one
 * ellipse (optionally two) painted per cell, each snapped to the Munsell
 * palette — the live mirror of the server's `/filters/circulate` output.
 *
 * Sizing/zoom/measurement are identical to `PixelatePreviewPane` (explicit-px
 * contain-fit, ResizeObserver, pinned zoom controls); see that file for the
 * layout rationale. The only difference is the renderer pipeline (the
 * `snap*Outer` / `snapInnerCells` / `paintCirculateCells` stages) and the
 * circulate grid math.
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
import {
  applyTopNReductionOuter,
  paintCirculateCells,
  restrictOuterPalette,
  snapAndDitherOuter,
  snapInnerCells,
} from "@/lib/editor/trace/circulate-preview"
import { readSourceCells } from "@/lib/editor/trace/pixelate-preview"
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

  // Stage 1 (heavy): read the cropped source + per-cell area-average.
  // Only re-runs when the source / crop / grid shape change, so unrelated
  // param toggles skip the per-source-pixel loop.
  const cellMeans = useMemo(
    () => (source && crop && valid ? readSourceCells({ source, crop, cellsX: grid.cellsX, cellsY: grid.cellsY }) : null),
    [source, crop, valid, grid.cellsX, grid.cellsY],
  )

  // Stage 2a: outer-palette PR-I PAM restriction (inner keeps the full palette).
  const outerPalette = useMemo(
    () =>
      cellMeans
        ? restrictOuterPalette({
            cellMeans,
            palette: palette ?? [],
            numColors: params.num_colors,
            distanceMetric: params.distance_metric,
            paletteRestriction: params.palette_restriction,
          })
        : (palette ?? []),
    [cellMeans, palette, params.num_colors, params.distance_metric, params.palette_restriction],
  )

  // Stage 2b: outer palette-snap with optional dithering. `dither_mode
  // === "texture"` also runs the blue-noise neighbour invasion.
  const outerSnapped = useMemo(
    () =>
      // Gate on `palette`: until `/api/palette` resolves the snap would
      // fall back to raw cell means (a vivid preview replaced ~150ms later
      // by the duller palette-snapped one). Hold the paint until the
      // palette is ready so the first preview shown is the accurate one.
      cellMeans && palette
        ? snapAndDitherOuter({
            cellMeans,
            cellsX: grid.cellsX,
            cellsY: grid.cellsY,
            palette: outerPalette,
            preSnapChromaScale: params.pre_snap_chroma_scale,
            ditherMode: params.dither_mode,
            ditherStrength: params.dither_strength,
            distanceMetric: params.distance_metric,
            textureLut: blueNoiseLut,
          })
        : null,
    [
      cellMeans,
      palette,
      grid.cellsX,
      grid.cellsY,
      outerPalette,
      params.pre_snap_chroma_scale,
      params.dither_mode,
      params.dither_strength,
      params.distance_metric,
      blueNoiseLut,
    ],
  )

  // Stage 3: outer top-N reduction (no-op for PAM).
  const outerReduced = useMemo(
    () =>
      outerSnapped
        ? applyTopNReductionOuter({
            cells: outerSnapped,
            palette: outerPalette,
            numColors: params.num_colors,
            distanceMetric: params.distance_metric,
            paletteRestriction: params.palette_restriction,
          })
        : null,
    [outerSnapped, outerPalette, params.num_colors, params.distance_metric, params.palette_restriction],
  )

  // Stage 5: inner ellipse colours (sub-colour filter, full palette).
  const innerAdjustment = useMemo(() => resolveInnerFilter(params.inner_filter), [params.inner_filter])
  const innerCells = useMemo(
    () =>
      cellMeans
        ? snapInnerCells({
            cellMeans,
            palette: palette ?? [],
            innerEnabled: params.inner_enabled,
            innerAdjustment,
            distanceMetric: params.distance_metric,
          })
        : null,
    [cellMeans, palette, params.inner_enabled, innerAdjustment, params.distance_metric],
  )

  const ellipseFractions = useMemo(() => circulateEllipseFractions(grid, params), [grid, params])
  const contourPx = useMemo(() => {
    if (!crop || grid.usedMmW <= 0 || grid.usedMmH <= 0) return 0
    const pxPerMmX = crop.w / grid.usedMmW
    const pxPerMmY = crop.h / grid.usedMmH
    return params.contour_width_mm * ((pxPerMmX + pxPerMmY) / 2)
  }, [crop, grid.usedMmW, grid.usedMmH, params.contour_width_mm])

  // Stage 6 (light): paint background + outer/inner ellipses + frames.
  useEffect(() => {
    const target = miniCanvasRef.current
    if (!target || !source || !crop || !outerReduced) return
    paintCirculateCells({
      target,
      source,
      crop,
      cellsX: grid.cellsX,
      cellsY: grid.cellsY,
      outer: outerReduced,
      inner: innerCells,
      ellipseFractions,
      contourPx,
    })
  }, [source, crop, outerReduced, innerCells, ellipseFractions, contourPx, grid.cellsX, grid.cellsY])

  // Spinner covers both the image load and the palette fetch: a valid grid
  // with no palette yet would otherwise paint the raw-means preview.
  const showSpinner = !source || !palette
  const showInvalid = source !== null && palette !== null && !valid

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
