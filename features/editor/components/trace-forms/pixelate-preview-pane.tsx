"use client"

/**
 * Pixelate preview pane: a single inline SVG displaying the cropped pixelate
 * grid with each cell snapped to the nearest Munsell palette chip. Cells
 * (`<rect>`) AND the grid live in ONE cell-unit coordinate space, so the grid
 * registers exactly with the cells — mirrors the applied trace, no drift.
 *
 * Sizing — explicit pixels, no CSS `aspect-ratio`. The pane fills the
 * dialog's body area via flex (`flex-1 min-h-0` inside `main`), so a PORTRAIT
 * preview uses the full vertical space instead of being squeezed into a
 * width-based square (the old "fixed square" wasted height and rendered
 * portraits as a thin strip). The dialog carries the definite height
 * (`h-[85vh]` → SidebarProvider `flex-1` → main `self-stretch`), so the
 * pane no longer duplicates the `85vh`/`4rem` math. The pane is measured with
 * a ResizeObserver (`pane.w`/`pane.h`); the canvas display size is
 * `min(paneW/usedMmW, paneH/usedMmH) × zoom` per axis — a plain contain-fit.
 * We size by display-mm, NOT the bitmap's cellsX × cellsY aspect, so
 * non-square supercells (e.g. 6 mm × 10 mm) don't distort; the near-square
 * bitmap is deliberately stretched to that px box. `image-rendering:
 * pixelated` keeps the per-cell upscale sharp; `bg-muted` shows wherever the
 * canvas doesn't reach.
 *
 * No ResizeObserver loop: the pane's height is layout-driven (flex, from the
 * dialog's definite height) and the canvas lives in an absolutely-positioned
 * scroller, so the canvas never feeds back into the measured box.
 *
 * Layout — the zoom controls sit OUTSIDE the scrolling area (siblings of the
 * `overflow-auto` scroller, on the relative pane), so they stay pinned to the
 * pane viewport and never scroll away with the zoomed image — like the
 * editor's floating toolbar at the canvas viewport.
 *
 * Source: loaded `HTMLImageElement` flows through the staged preview
 * helpers (`readSourceCells` → snap/dither/texture/reduce → `buildPixelateCellsSvg`).
 * Inputs are reactive: when `params` changes, a fresh SVG string is built and
 * injected via `dangerouslySetInnerHTML` (one DOM re-parse, no React diff over
 * the thousands of `<rect>`).
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
import type { TraceContentRegion } from "@/lib/editor/trace/content-region"
import {
  applyTopNReduction,
  buildPixelateCellsSvg,
  readSourceCells,
  restrictPaletteForCells,
  snapAndDitherCells,
} from "@/lib/editor/trace/pixelate-preview"
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
  params: PixelateParams
  /** Content region (artboard − padding). When present the preview crops to the
   * SAME printable window the apply path traces (white where uncovered), using
   * the content-rect mm — parity with the result. Absent → whole image. */
  contentRegion?: TraceContentRegion | null
}

export function PixelatePreviewPane({ sourceImageUrl, displayMmW, displayMmH, params, contentRegion }: Props) {
  const source = useSourceImage(sourceImageUrl)
  // Effective geometry: content-rect mm + a composited (white + image window)
  // source when a content region is present; else the raw image + image mm.
  const effMmW = contentRegion?.displayMmW ?? displayMmW
  const effMmH = contentRegion?.displayMmH ?? displayMmH
  // Snap cells to the same Munsell palette the server uses. Null until the
  // `/api/palette` fetch resolves; `snapAndDitherCells` falls back to raw
  // means when the palette is empty.
  const palette = useTracePalette(params.color_mode)
  // Blue-noise LUT for the texture step. Null while loading → preview just
  // skips the texture, snapped cells ship as-is until the LUT lands.
  const blueNoiseLut = useBlueNoiseLut()
  const grid = useMemo(
    () => resolvePixelateGrid(effMmW, effMmH, params),
    [effMmW, effMmH, params],
  )
  const valid = isPixelateGridValid(grid)

  // Content-region composited source: a white canvas the size of the content
  // rect (at source density) with the image window drawn in — byte-parity with
  // the server's `compositeContentRegion`. Null → use the raw image.
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

  const paneRef = useRef<HTMLDivElement | null>(null)
  const [pane, setPane] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)

  // Measure the pane's available box (CSS px), both axes. The pane has a
  // definite height (see wrapper) and a layout-driven width; the canvas lives
  // in an absolutely-positioned scroller, so it never feeds back into this
  // measurement — no ResizeObserver loop.
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

  // Stage 1 (heavy): read the cropped source + per-cell area-average.
  // Only re-runs when the source bitmap, crop rect, or grid shape change —
  // unrelated param toggles (palette, dither, texture, distance, …) skip
  // the per-source-pixel loop entirely.
  const cellMeans = useMemo(
    () => (effSource && crop && valid ? readSourceCells({ source: effSource, crop, cellsX: grid.cellsX, cellsY: grid.cellsY }) : null),
    [effSource, crop, valid, grid.cellsX, grid.cellsY],
  )

  // Stage 2a: PR-I PAM pre-snap palette restriction. No-op for top_n.
  const activePalette = useMemo(
    () =>
      cellMeans
        ? restrictPaletteForCells({
            cellMeans,
            palette: palette ?? [],
            numColors: params.num_colors,
            distanceMetric: params.distance_metric,
            paletteRestriction: params.palette_restriction,
          })
        : (palette ?? []),
    [cellMeans, palette, params.num_colors, params.distance_metric, params.palette_restriction],
  )

  // Stage 2b: palette-snap with optional dithering. `dither_mode="texture"`
  // also runs the blue-noise neighbour invasion as part of the dispatch.
  const snappedCells = useMemo(
    () =>
      // Gate on `palette`: until `/api/palette` resolves, `palette` is null
      // and snapping would fall back to raw (unsnapped) cell means — a
      // vivid preview that gets replaced ~150ms later by the duller
      // palette-snapped one (and Apply uses the snapped colours). Hold the
      // paint until the palette is ready so the first preview shown is the
      // accurate one.
      cellMeans && palette
        ? snapAndDitherCells({
            cellMeans,
            cellsX: grid.cellsX,
            cellsY: grid.cellsY,
            palette: activePalette,
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
      activePalette,
      params.pre_snap_chroma_scale,
      params.dither_mode,
      params.dither_strength,
      params.distance_metric,
      blueNoiseLut,
    ],
  )

  // Stage 3: post-snap top-N reduction (no-op for PAM).
  const reducedCells = useMemo(
    () =>
      snappedCells
        ? applyTopNReduction({
            cells: snappedCells,
            palette: activePalette,
            numColors: params.num_colors,
            distanceMetric: params.distance_metric,
            paletteRestriction: params.palette_restriction,
          })
        : null,
    [snappedCells, activePalette, params.num_colors, params.distance_metric, params.palette_restriction],
  )

  // Stage 4 (light): build the preview as ONE SVG string — colour rects + grid
  // in one PIXEL-space coordinate system (the crop's source-pixel size), so the
  // grid registers exactly with the cells (no drift) AND the stroke scales down
  // to a sub-pixel hairline — mirroring the applied trace result exactly.
  const svgMarkup = useMemo(
    () =>
      reducedCells && valid && crop
        ? buildPixelateCellsSvg({
            cells: reducedCells,
            cellsX: grid.cellsX,
            cellsY: grid.cellsY,
            cropW: Math.round(crop.w),
            cropH: Math.round(crop.h),
          })
        : null,
    [reducedCells, valid, crop, grid.cellsX, grid.cellsY],
  )

  // Spinner covers both the image load and the palette fetch: a valid grid
  // with no palette yet would otherwise paint the raw-means preview.
  const showSpinner = !source || !palette
  const showInvalid = source !== null && palette !== null && !valid

  const handleZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))
  const handleFit = () => setZoom(1)
  const zoomLabel = `${Math.round(zoom * 100)}%`

  // Displayed canvas size in CSS px: contain-fit the display geometry into
  // the measured pane (the smaller per-axis ratio wins), then apply zoom.
  // zoom === 1 fits; zoom > 1 grows past the pane and the scroller scrolls.
  // Null until the pane is measured or the grid is invalid → canvas → 0.
  const display = useMemo(() => {
    if (!valid || pane.w <= 0 || pane.h <= 0 || grid.usedMmW <= 0 || grid.usedMmH <= 0) return null
    const fitScale = Math.min(pane.w / grid.usedMmW, pane.h / grid.usedMmH)
    return {
      w: grid.usedMmW * fitScale * zoom,
      h: grid.usedMmH * fitScale * zoom,
    }
  }, [valid, pane.w, pane.h, grid.usedMmW, grid.usedMmH, zoom])

  return (
    <div
      ref={paneRef}
      // Fills `main` (the dialog body below the h-16 header) via flex. The
      // dialog carries the definite height (`md:h-[85vh]` → SidebarProvider
      // `flex-1` → main `self-stretch`), so the pane no longer hardcodes the
      // 85vh/4rem math. `min-h-0` lets it shrink within main's
      // overflow-hidden column.
      className="relative w-full flex-1 min-h-0 bg-muted"
    >
      {/* The ONLY scrolling area. Zoom > 1 overflows here; the controls and
          status overlays below are siblings, so they stay pinned. */}
      <div className="absolute inset-0 overflow-auto">
        <div
          className="flex items-center justify-center"
          style={{
            width: "fit-content",
            minWidth: "100%",
            height: "fit-content",
            minHeight: "100%",
          }}
        >
          {/* The preview is ONE inline SVG (colour rects + grid in the same
              cell-unit coordinate space) injected as a string — so the grid
              sits exactly on the cell boundaries, and it mirrors the applied
              trace overlay. `preserveAspectRatio="none"` (in the markup)
              stretches it to this display box; zoom just grows the box. */}
          <div
            className="relative block"
            style={{ width: display?.w ?? 0, height: display?.h ?? 0, lineHeight: 0 }}
            data-testid="pixelate-preview-svg"
            {...(svgMarkup && display ? { dangerouslySetInnerHTML: { __html: svgMarkup } } : {})}
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
            data-testid="pixelate-preview-zoom-controls"
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
            <span className="px-2 text-xs tabular-nums text-muted-foreground" data-testid="pixelate-preview-zoom-label">
              {zoomLabel}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
