"use client"

/**
 * Line Art preview pane: a downscaled canvas approximating the
 * vtracer + palette-snap result via client-side K-means quantisation.
 *
 * Pipeline (decomposed via `useMemo` so unrelated param toggles skip
 * the work):
 *   1. Downscale source to max 256px edge (`loadAndDownscale`)
 *   2. Gaussian blur with `blur_amount`
 *   3. K-means OKLab with K = `num_colors`
 *   4. Snap each centroid to the active Munsell palette
 *      (`color_mode` picks color vs B/W)
 *   5. Paint flat regions onto the visible canvas; optional 1-px
 *      cluster-boundary overlay when `line_thickness > 0`
 *
 * Pane sizing + zoom controls mirror `pixelate-preview-pane.tsx` so
 * the surrounding shell is visually identical.
 *
 * NOT pixel-perfect to the server's vtracer output; it's an
 * approximation that tracks the params well enough to choose them.
 * The Apply step uses the authoritative server pipeline.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { LineartParams } from "@/lib/editor/trace/lineart"
import {
  gaussianBlur,
  kMeansOklab,
  loadAndDownscale,
  paintQuantizedToCanvas,
  snapCentroidsToPalette,
} from "@/lib/editor/trace/lineart-preview"
import { useSourceImage } from "@/lib/editor/trace/use-source-image"
import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

// 384px buffer: the 1-px cluster-boundary pass paints a thinner line
// (~2.7 CSS-px at a 1024 display vs ~4 CSS-px from the previous 256
// buffer) without making k-means costly enough to need a worker.
const MAX_PREVIEW_EDGE_PX = 384
const KMEANS_MAX_ITER = 10

const ZOOM_STEP = 1.5
const ZOOM_MIN = 1
const ZOOM_MAX = 8

type Props = {
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
  params: LineartParams
}

export function LineArtPreviewPane({ sourceImageUrl, displayMmW, displayMmH, params }: Props) {
  const source = useSourceImage(sourceImageUrl)
  const palette = useTracePalette(params.color_mode)

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

  // Stage 1: downscale source to a working buffer (≤256px edge).
  const downscaled = useMemo(() => {
    if (!source) return null
    return loadAndDownscale({
      source,
      sourceWidth: source.naturalWidth,
      sourceHeight: source.naturalHeight,
      maxEdgePx: MAX_PREVIEW_EDGE_PX,
    })
  }, [source])

  // Stage 2: blur. Skipped when blur_amount = 0.
  const blurred = useMemo(() => {
    if (!downscaled) return null
    return gaussianBlur(downscaled, params.blur_amount)
  }, [downscaled, params.blur_amount])

  // Stage 3: K-means quantisation in OKLab.
  const quantized = useMemo(() => {
    if (!blurred) return null
    return kMeansOklab(blurred, params.num_colors, KMEANS_MAX_ITER)
  }, [blurred, params.num_colors])

  // Stage 4: snap centroids to the active Munsell palette.
  const snapped = useMemo(() => {
    if (!quantized) return null
    return snapCentroidsToPalette(quantized.centroids, palette ?? [])
  }, [quantized, palette])

  // Stage 5: paint. Re-runs when assignments, snapped colours, or the
  // outline thickness change.
  useEffect(() => {
    const target = miniCanvasRef.current
    if (!target || !blurred || !quantized || !snapped) return
    paintQuantizedToCanvas({
      target,
      width: blurred.width,
      height: blurred.height,
      assignments: quantized.assignments,
      snappedCentroids: snapped,
      lineThickness: params.line_thickness,
    })
  }, [blurred, quantized, snapped, params.line_thickness])

  const valid = displayMmW > 0 && displayMmH > 0
  const showSpinner = !source
  const showInvalid = source !== null && !valid

  const handleZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))
  const handleFit = () => setZoom(1)
  const zoomLabel = `${Math.round(zoom * 100)}%`

  const display = useMemo(() => {
    if (!valid || pane.w <= 0 || pane.h <= 0 || displayMmW <= 0 || displayMmH <= 0) return null
    const fitScale = Math.min(pane.w / displayMmW, pane.h / displayMmH)
    return {
      w: displayMmW * fitScale * zoom,
      h: displayMmH * fitScale * zoom,
    }
  }, [valid, pane.w, pane.h, displayMmW, displayMmH, zoom])

  return (
    <div ref={paneRef} className="relative w-full flex-1 min-h-0 bg-muted">
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
            width={blurred ? blurred.width : 1}
            height={blurred ? blurred.height : 1}
            className="block"
            style={{
              width: display?.w ?? 0,
              height: display?.h ?? 0,
              imageRendering: "pixelated",
            }}
            data-testid="lineart-preview-mini"
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
          <span className="text-xs text-muted-foreground">No source dimensions</span>
        </div>
      ) : null}

      {source && valid ? (
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 z-10 flex justify-center">
          <div
            className="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-background/90 px-1 py-1 shadow-md backdrop-blur"
            data-testid="lineart-preview-zoom-controls"
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
              data-testid="lineart-preview-zoom-label"
            >
              {zoomLabel}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
