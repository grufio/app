"use client"

/**
 * Linerate preview pane — a fast client-side APPROXIMATION of the paint-by-
 * numbers layout: downscale → blur → K-means quantise → snap clusters to the
 * active Munsell palette → connected-component facets → merge facets below the
 * `detail`-derived min-area into their most-similar neighbour → flat fill + 1px
 * outlines. It reuses the `lineart-preview.ts` colour helpers and the linerate
 * facet helpers in `linerate-preview.ts`.
 *
 * NOT the authoritative output: linerate's smooth, watertight outlines +
 * per-region numbers are computed server-side on Apply. This pane answers
 * "roughly which colours AND how many regions will I get" — the region
 * granularity tracks the Detail and Min-paintable-gap dials (approximate, not
 * server-parity: Gaussian blur vs L0, K-means vs coverage selection).
 *
 * Pane sizing + zoom controls mirror the sibling trace preview panes.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { LinerateParams } from "@/lib/editor/trace/linerate"
import { gaussianBlur, kMeansOklab, loadAndDownscale } from "@/lib/editor/trace/lineart-preview"
import {
  chipPerCluster,
  detailToMinArea,
  renderRegionsRgba,
  segmentRegions,
} from "@/lib/editor/trace/linerate-preview"
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

  // Approximate the server's L0 edge-preserving flatten with a plain Gaussian
  // blur (the preview is a fast approximation, not the exact result):
  // flatten ∈ [0,1] → blur radius ~0..8.
  const blurred = useMemo(() => {
    if (!downscaled) return null
    return gaussianBlur(downscaled, Math.round(params.flatten * 8))
  }, [downscaled, params.flatten])

  const quantized = useMemo(() => {
    if (!blurred) return null
    return kMeansOklab(blurred, params.num_colors, KMEANS_MAX_ITER)
  }, [blurred, params.num_colors])

  // Chip index per cluster — CC runs on the palette chip, not the raw cluster
  // (two clusters can snap to the same chip).
  const clusterChip = useMemo(() => {
    if (!quantized || !palette) return null
    return chipPerCluster(quantized.centroids, palette)
  }, [quantized, palette])

  // `detail` + `min_paintable_mm` drive region granularity; defer them so the
  // (heavier) segmentation stays interruptible while the user drags a slider.
  const deferredDetail = useDeferredValue(params.detail)
  const deferredGapMm = useDeferredValue(params.min_paintable_mm)

  // Facet segmentation: paint map → connected components → min-area merge.
  const regions = useMemo(() => {
    if (!blurred || !quantized || !clusterChip || !palette || palette.length === 0) return null
    const w = blurred.width
    const h = blurred.height
    const paintMap = new Int32Array(w * h)
    const assignments = quantized.assignments
    for (let i = 0; i < paintMap.length; i += 1) paintMap[i] = clusterChip[assignments[i]]

    // Min-radius floor in preview px — mirrors the server mm→px chain
    // (services/editor/server/trace/linerate.ts + linerate.py min_radius_work):
    // (min_paintable_mm·(previewW/displayMmW) + line_thickness·(previewW/contentW))/2.
    const contentW = source?.naturalWidth ?? w
    const mmTerm = displayMmW > 0 ? deferredGapMm * (w / displayMmW) : 0
    const ltTerm = contentW > 0 ? params.line_thickness * (w / contentW) : 0
    const minRadiusPx = Math.max(0, (mmTerm + ltTerm) / 2)
    const minArea = detailToMinArea(deferredDetail, w * h, minRadiusPx)

    const chipOklab = palette.map((c) => c.oklab)
    return segmentRegions(paintMap, w, h, chipOklab, minArea)
  }, [
    blurred,
    quantized,
    clusterChip,
    palette,
    source,
    displayMmW,
    deferredDetail,
    deferredGapMm,
    params.line_thickness,
  ])

  // Paint flat regions with 1px black outlines.
  useEffect(() => {
    const target = canvasRef.current
    if (!target || !blurred || !regions || !palette || palette.length === 0) return
    const ctx = target.getContext("2d")
    if (!ctx) return
    const chipRgb = palette.map((c) => c.rgb)
    const rgba = renderRegionsRgba(regions.labels, regions.regionChip, chipRgb, blurred.width, blurred.height)
    const out = ctx.createImageData(blurred.width, blurred.height)
    out.data.set(rgba)
    ctx.putImageData(out, 0, 0)
  }, [blurred, regions, palette])

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
