"use client"

/**
 * Circulate preview pane: a single canvas showing one ellipse (optionally two)
 * per cell, each snapped to the Munsell palette, on a transparent background — the
 * live mirror of the server's `/filters/circulate` output. Like the pixelate
 * preview, only the trace output is drawn (no source photo underneath); the crop
 * follows the content region for parity with the apply path.
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
import type { TraceContentRegion } from "@/lib/editor/trace/content-region"
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
  /** Content region (artboard − padding). When present the preview crops to the
   * SAME printable window the apply path traces (white where uncovered) — parity
   * with the pixelate preview. Absent → whole image. */
  contentRegion?: TraceContentRegion | null
  params: CirculateParams
}

export function CirculatePreviewPane({ sourceImageUrl, displayMmW, displayMmH, contentRegion, params }: Props) {
  const source = useSourceImage(sourceImageUrl)
  // Effective geometry: content-rect mm + a composited (white + image window)
  // source when a content region is present; else the raw image + image mm —
  // identical to PixelatePreviewPane.
  const effMmW = contentRegion?.displayMmW ?? displayMmW
  const effMmH = contentRegion?.displayMmH ?? displayMmH
  const palette = useTracePalette(params.color_mode)
  const blueNoiseLut = useBlueNoiseLut()
  const grid = useMemo(
    () => resolveCirculateGrid(effMmW, effMmH, params),
    [effMmW, effMmH, params],
  )
  const valid = isCirculateGridValid(grid)

  // Content-region composited source (white canvas + image window), byte-parity
  // with the server's compositeContentRegion. Null → use the raw image.
  const contentSource = useMemo(() => {
    if (!source || !contentRegion) return null
    const plan = contentRegion.plan
    const c = document.createElement("canvas")
    c.width = Math.max(1, Math.round(plan.canvasPx.widthPx))
    c.height = Math.max(1, Math.round(plan.canvasPx.heightPx))
    const ctx = c.getContext("2d")
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, c.width, c.height)
    const comp = plan.composite
    if (comp) {
      ctx.drawImage(
        source,
        comp.extract.left, comp.extract.top, comp.extract.width, comp.extract.height,
        comp.placeAt.left, comp.placeAt.top, comp.extract.width, comp.extract.height,
      )
    }
    return c
  }, [source, contentRegion])

  const effSource: CanvasImageSource | null = contentRegion ? contentSource : source
  const effSourceW = contentRegion ? (contentSource?.width ?? 0) : (source?.naturalWidth ?? 0)
  const effSourceH = contentRegion ? (contentSource?.height ?? 0) : (source?.naturalHeight ?? 0)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
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
    if (!effSource || !valid || effMmW <= 0 || effMmH <= 0 || effSourceW <= 0 || effSourceH <= 0) return null
    return centeredCropPixels({
      pixelW: effSourceW,
      pixelH: effSourceH,
      displayMmW: effMmW,
      displayMmH: effMmH,
      grid,
    })
  }, [effSource, effSourceW, effSourceH, valid, effMmW, effMmH, grid])

  // Stage 1 (heavy): read the cropped (content-region) source + per-cell area-average.
  // Only re-runs when the source / crop / grid shape change, so unrelated
  // param toggles skip the per-source-pixel loop.
  const cellMeans = useMemo(
    () => (effSource && crop && valid ? readSourceCells({ source: effSource, crop, cellsX: grid.cellsX, cellsY: grid.cellsY }) : null),
    [effSource, crop, valid, grid.cellsX, grid.cellsY],
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

  // Stage 4: inner ellipse colours (sub-colour filter, full palette).
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

  // Display box (CSS px): contain-fit + zoom. The canvas BACKING is display × dpr,
  // so ellipses + the 1px frames render at DEVICE resolution → crisp at any zoom
  // (replaces the old crop-res canvas + `imageRendering: pixelated`, which made the
  // 1px frames thick blocks when zoomed in and soft when zoomed out).
  const display = useMemo(() => {
    if (!valid || pane.w <= 0 || pane.h <= 0 || grid.usedMmW <= 0 || grid.usedMmH <= 0) return null
    const fitScale = Math.min(pane.w / grid.usedMmW, pane.h / grid.usedMmH)
    return { w: grid.usedMmW * fitScale * zoom, h: grid.usedMmH * fitScale * zoom }
  }, [valid, pane.w, pane.h, grid.usedMmW, grid.usedMmH, zoom])
  const dpr = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1)
  const wDev = display ? Math.max(1, Math.round(display.w * dpr)) : 0
  const hDev = display ? Math.max(1, Math.round(display.h * dpr)) : 0

  const ellipseFractions = useMemo(() => circulateEllipseFractions(grid, params), [grid, params])
  // Contour width in the canvas' DEVICE-px space (physical mm → device px).
  const contourPx = useMemo(() => {
    if (wDev <= 0 || hDev <= 0 || grid.usedMmW <= 0 || grid.usedMmH <= 0) return 0
    const pxPerMmX = wDev / grid.usedMmW
    const pxPerMmY = hDev / grid.usedMmH
    return params.contour_width_mm * ((pxPerMmX + pxPerMmY) / 2)
  }, [wDev, hDev, grid.usedMmW, grid.usedMmH, params.contour_width_mm])

  // Stage 5 (light): paint the outer/inner ellipses + frames at device resolution —
  // no source photo, transparent background (only the trace output, like pixelate).
  // Sets the canvas backing in the effect (device px), same mechanism as pixelate.
  useEffect(() => {
    const target = canvasRef.current
    if (!target || !outerReduced || wDev <= 0 || hDev <= 0) return
    target.width = wDev
    target.height = hDev
    paintCirculateCells({
      target,
      cellsX: grid.cellsX,
      cellsY: grid.cellsY,
      outer: outerReduced,
      inner: innerCells,
      ellipseFractions,
      contourPx,
    })
  }, [outerReduced, innerCells, ellipseFractions, contourPx, grid.cellsX, grid.cellsY, wDev, hDev])

  // Spinner covers both the image load and the palette fetch: a valid grid
  // with no palette yet would otherwise paint the raw-means preview.
  const showSpinner = !source || !palette
  const showInvalid = source !== null && palette !== null && !valid

  const handleZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))
  const handleFit = () => setZoom(1)
  const zoomLabel = `${Math.round(zoom * 100)}%`

  return (
    <div ref={paneRef} className="relative w-full flex-1 min-h-0 bg-muted">
      <div className="absolute inset-0 overflow-auto">
        <div
          className="flex items-center justify-center"
          style={{ width: "fit-content", minWidth: "100%", height: "fit-content", minHeight: "100%" }}
        >
          <canvas
            ref={canvasRef}
            className="relative block"
            style={{ width: display?.w ?? 0, height: display?.h ?? 0 }}
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
