"use client"

/**
 * Linerate preview pane — a fast client-side APPROXIMATION of the colour /
 * region layout: downscale → blur → K-means quantise → snap each cluster to
 * the active Munsell palette → paint flat regions. It reuses the same
 * `lineart-preview.ts` helpers.
 *
 * NOT the authoritative output: linerate's smooth, watertight outlines +
 * per-region numbers are computed server-side on Apply (segmentation + shared-
 * arc smoothing). This pane only answers "which colours / regions will I get".
 * (A full live-parity preview running the same algorithm in the browser is a
 * planned follow-up.)
 *
 * Pane sizing + zoom controls mirror the sibling trace preview panes.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { LinerateParams } from "@/lib/editor/trace/linerate"
import {
  gaussianBlur,
  kMeansOklab,
  loadAndDownscale,
  snapCentroidsToPalette,
} from "@/lib/editor/trace/lineart-preview"
import { useSourceImage } from "@/lib/editor/trace/use-source-image"
import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

const MAX_PREVIEW_EDGE_PX = 384
const KMEANS_MAX_ITER = 10
const ZOOM_STEP = 1.5
const ZOOM_MIN = 1
const ZOOM_MAX = 8

type Props = {
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
  params: LinerateParams
}

export function LineratePreviewPane({ sourceImageUrl, displayMmW, displayMmH, params }: Props) {
  const source = useSourceImage(sourceImageUrl)
  const palette = useTracePalette(params.color_mode)

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

  const downscaled = useMemo(() => {
    if (!source) return null
    return loadAndDownscale({
      source,
      sourceWidth: source.naturalWidth,
      sourceHeight: source.naturalHeight,
      maxEdgePx: MAX_PREVIEW_EDGE_PX,
    })
  }, [source])

  const blurred = useMemo(() => {
    if (!downscaled) return null
    return gaussianBlur(downscaled, params.blur_amount)
  }, [downscaled, params.blur_amount])

  const quantized = useMemo(() => {
    if (!blurred) return null
    return kMeansOklab(blurred, params.num_colors, KMEANS_MAX_ITER)
  }, [blurred, params.num_colors])

  const snapped = useMemo(() => {
    if (!quantized || !palette) return null
    return snapCentroidsToPalette(quantized.centroids, palette)
  }, [quantized, palette])

  // Paint flat palette-snapped regions.
  useEffect(() => {
    const target = canvasRef.current
    if (!target || !blurred || !quantized || !snapped || snapped.length === 0) return
    const ctx = target.getContext("2d")
    if (!ctx) return
    const { width, height, assignments } = { ...blurred, assignments: quantized.assignments }
    const out = ctx.createImageData(width, height)
    for (let i = 0; i < assignments.length; i += 1) {
      const chip = snapped[assignments[i]]
      const o = i * 4
      out.data[o] = chip.r
      out.data[o + 1] = chip.g
      out.data[o + 2] = chip.b
      out.data[o + 3] = 255
    }
    ctx.putImageData(out, 0, 0)
  }, [blurred, quantized, snapped])

  const valid = displayMmW > 0 && displayMmH > 0
  const showSpinner = !source || !palette
  const showInvalid = source !== null && palette !== null && !valid

  const handleZoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))
  const handleZoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))
  const handleFit = () => setZoom(1)
  const zoomLabel = `${Math.round(zoom * 100)}%`

  const display = useMemo(() => {
    if (!valid || pane.w <= 0 || pane.h <= 0 || displayMmW <= 0 || displayMmH <= 0) return null
    const fitScale = Math.min(pane.w / displayMmW, pane.h / displayMmH)
    return { w: displayMmW * fitScale * zoom, h: displayMmH * fitScale * zoom }
  }, [valid, pane.w, pane.h, displayMmW, displayMmH, zoom])

  return (
    <div ref={paneRef} className="relative w-full flex-1 min-h-0 bg-muted">
      <div className="absolute inset-0 overflow-auto">
        <div
          className="flex items-center justify-center"
          style={{ width: "fit-content", minWidth: "100%", height: "fit-content", minHeight: "100%" }}
        >
          <canvas
            ref={canvasRef}
            width={blurred ? blurred.width : 1}
            height={blurred ? blurred.height : 1}
            className="block"
            style={{ width: display?.w ?? 0, height: display?.h ?? 0, imageRendering: "pixelated" }}
            data-testid="linerate-preview-mini"
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
            data-testid="linerate-preview-zoom-controls"
          >
            <Button variant="ghost" size="icon" className="size-7" onClick={handleZoomOut} disabled={zoom <= ZOOM_MIN + 1e-6} aria-label="Zoom out">
              <ZoomOut className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={handleFit} disabled={Math.abs(zoom - 1) < 1e-6} aria-label="Fit">
              <Maximize2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={handleZoomIn} disabled={zoom >= ZOOM_MAX - 1e-6} aria-label="Zoom in">
              <ZoomIn className="size-4" />
            </Button>
            <span className="px-2 text-xs tabular-nums text-muted-foreground" data-testid="linerate-preview-zoom-label">
              {zoomLabel}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
