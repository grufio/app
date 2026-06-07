"use client"

/**
 * Pixelate preview pane: a single canvas displaying the cropped pixelate
 * grid with each cell snapped to the nearest Munsell palette chip.
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
 * Source: loaded `HTMLImageElement` is fed directly to `buildMiniCanvas` via
 * `drawImage`. Inputs are reactive: when `params` changes, the mini canvas is
 * redrawn in-place (React owns its `width`/`height` attributes via JSX props,
 * so the bitmap clears + redraws cleanly).
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
}

export function PixelatePreviewPane({ sourceImageUrl, displayMmW, displayMmH, params }: Props) {
  const source = useSourceImage(sourceImageUrl)
  // Snap cells to the same Munsell palette the server uses. Null until the
  // `/api/palette` fetch resolves; buildMiniCanvas falls back to raw means.
  const palette = useTracePalette(params.color_mode)
  // Blue-noise LUT for the texture step. Null while loading → preview just
  // skips the texture, snapped cells ship as-is until the LUT lands.
  const blueNoiseLut = useBlueNoiseLut()
  const grid = useMemo(
    () => resolvePixelateGrid(displayMmW, displayMmH, params),
    [displayMmW, displayMmH, params],
  )
  const valid = isPixelateGridValid(grid)

  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)
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
      palette: palette ?? [],
      preSnapChromaScale: params.pre_snap_chroma_scale,
      numColors: params.num_colors,
      textureEnabled: params.texture_enabled,
      textureStrength: params.texture_strength,
      textureLut: blueNoiseLut,
      ditherMode: params.dither_mode,
      ditherPatternSize: params.dither_pattern_size,
      distanceMetric: params.distance_metric,
      paletteRestriction: params.palette_restriction,
    })
  }, [
    source,
    crop,
    valid,
    grid.cellsX,
    grid.cellsY,
    palette,
    params.pre_snap_chroma_scale,
    params.num_colors,
    params.texture_enabled,
    params.texture_strength,
    blueNoiseLut,
    params.dither_mode,
    params.dither_pattern_size,
    params.distance_metric,
    params.palette_restriction,
  ])

  const showSpinner = !source
  const showInvalid = source !== null && !valid

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
