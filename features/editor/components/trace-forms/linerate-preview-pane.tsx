"use client"

/**
 * Linerate preview pane — a client mirror of the server paint-by-numbers front
 * half: downscale → L0 edge-preserving flatten (Web Worker) → coverage paint
 * selection → connected-component facets → merge facets below the `detail`-derived
 * min-area into their most-similar neighbour → flat fill + 1px outlines. Uses the
 * same L0 (`l0-smooth.ts`) and coverage (`coverage-select.ts`) the server runs,
 * plus the facet helpers in `linerate-preview.ts`.
 *
 * NOT bit-identical to Apply (JS FFT ≠ numpy, ~256px work res, no per-region
 * numbers), but the region density matches the result — an earlier Gaussian-blur
 * approximation left texture standing and the segmentation over-split it into
 * speckle. L0 is the one heavy stage and depends only on `flatten`, so it runs in
 * a worker off the main thread; Detail/Min-gap only re-run the fast CC + merge.
 *
 * Pane sizing + zoom controls mirror the sibling trace preview panes.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { assembleFaces, buildArcs, smoothArc } from "@/lib/editor/trace/boundary-arcs"
import { smoothnessToParams } from "@/lib/editor/trace/contour-trace"
import { coverageSelectPaintMap } from "@/lib/editor/trace/coverage-select"
import type { LinerateParams } from "@/lib/editor/trace/linerate"
import { loadAndDownscale, type PreviewImage } from "@/lib/editor/trace/lineart-preview"
import { detailToMinArea, segmentRegions } from "@/lib/editor/trace/linerate-preview"
import { useSourceImage } from "@/lib/editor/trace/use-source-image"
import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

// Work resolution for the segmentation. Region count is fraction-based (thus
// ~scale-invariant), so 256px matches the server's density while keeping the L0
// FFT tractable in the worker.
const MAX_PREVIEW_EDGE_PX = 256
// Outlines are drawn as smooth vector paths on a supersampled canvas via the
// WATERTIGHT shared-arc method (buildArcs → smoothArc → assembleFaces, ported
// from the server): each shared boundary is smoothed ONCE and used by both
// neighbours → no holes; image-border arcs stay straight → straight frame.
// Smoothing amount follows the Smoothness dial (smoothnessToParams), eps scaled
// from the server's 480px work space to the preview resolution.
const OUTLINE_SUPERSAMPLE = 4
const SERVER_WORK_EDGE = 480
const OUTLINE_STROKE_PX = 2
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

  // L0 edge-preserving flatten runs in a Web Worker (heavy: several 2D FFTs; it
  // would freeze the tab on the main thread). Depends only on `flatten`.
  const workerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)
  const [flattened, setFlattened] = useState<PreviewImage | null>(null)
  const [flattening, setFlattening] = useState(false)

  useEffect(() => {
    const worker = new Worker(
      new URL("../../../../lib/editor/trace/linerate-preview.worker.ts", import.meta.url),
      { type: "module" },
    )
    workerRef.current = worker
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    const worker = workerRef.current
    if (!downscaled || !worker) {
      setFlattened(null)
      return
    }
    const id = (reqIdRef.current += 1)
    setFlattening(true)
    const onMessage = (e: MessageEvent<{ id: number; rgba: ArrayBuffer; width: number; height: number }>) => {
      if (e.data.id !== reqIdRef.current) return // ignore stale results
      setFlattened({ width: e.data.width, height: e.data.height, rgba: new Uint8ClampedArray(e.data.rgba) })
      setFlattening(false)
    }
    worker.addEventListener("message", onMessage)
    worker.postMessage({
      id,
      rgba: downscaled.rgba,
      width: downscaled.width,
      height: downscaled.height,
      flatten: params.flatten,
    })
    return () => worker.removeEventListener("message", onMessage)
  }, [downscaled, params.flatten])

  // Coverage paint selection (top-K most-used chips) → per-pixel paint map.
  const paintMap = useMemo(() => {
    if (!flattened || !palette || palette.length === 0) return null
    return coverageSelectPaintMap(flattened, palette, params.num_colors)
  }, [flattened, palette, params.num_colors])

  // `detail` + `min_paintable_mm` drive region granularity; defer them so the
  // segmentation stays interruptible while the user drags a slider.
  const deferredDetail = useDeferredValue(params.detail)
  const deferredGapMm = useDeferredValue(params.min_paintable_mm)

  // Facet segmentation: paint map → connected components → min-area merge.
  const regions = useMemo(() => {
    if (!flattened || !paintMap || !palette || palette.length === 0) return null
    const w = flattened.width
    const h = flattened.height

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
    flattened,
    paintMap,
    palette,
    source,
    displayMmW,
    deferredDetail,
    deferredGapMm,
    params.line_thickness,
  ])

  // Watertight boundary arc graph (shared arcs smoothed once). Depends only on
  // the segmentation + smoothness, not zoom.
  const graph = useMemo(() => {
    if (!regions || !flattened) return null
    // Smoothing amount from the Smoothness dial, eps scaled 480px → preview res.
    const { eps, iters } = smoothnessToParams(params.smoothness)
    const scaledEps = (eps * Math.max(flattened.width, flattened.height)) / SERVER_WORK_EDGE
    const g = buildArcs(regions.labels, flattened.width, flattened.height)
    for (const arc of g.arcs) arc.smooth = smoothArc(arc.corners, g.cornerStride, scaledEps, iters)
    return g
  }, [regions, flattened, params.smoothness])

  // Draw: watertight region fills (evenodd for holes) + one thin stroke per shared
  // INTERNAL arc. Border arcs (label -1) are never stroked → straight, clean frame.
  useEffect(() => {
    const target = canvasRef.current
    if (!target || !flattened || !regions || !graph || !palette || palette.length === 0) return
    const ctx = target.getContext("2d")
    if (!ctx) return
    const ss = OUTLINE_SUPERSAMPLE
    ctx.clearRect(0, 0, target.width, target.height)

    // Fill each region's face (all loops as subpaths, evenodd carves holes).
    for (const [region, arcIdxs] of graph.regionArcs) {
      if (arcIdxs.length === 0) continue
      const loops = assembleFaces(graph.arcs, graph.regionArcs, region)
      const path = new Path2D()
      for (const loop of loops) {
        if (loop.length === 0) continue
        path.moveTo(loop[0][0] * ss, loop[0][1] * ss)
        for (let i = 1; i < loop.length; i += 1) path.lineTo(loop[i][0] * ss, loop[i][1] * ss)
        path.closePath()
      }
      const [r, g, b] = palette[regions.regionChip[region]].rgb
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fill(path, "evenodd")
    }

    // Stroke each internal shared arc once; skip image-border arcs (-1 label).
    ctx.lineJoin = "round"
    ctx.lineWidth = OUTLINE_STROKE_PX
    ctx.strokeStyle = "black"
    for (const arc of graph.arcs) {
      if (arc.labels[0] < 0 || arc.labels[1] < 0) continue
      const s = arc.smooth
      if (s.length < 2) continue
      const path = new Path2D()
      path.moveTo(s[0][0] * ss, s[0][1] * ss)
      for (let i = 1; i < s.length; i += 1) path.lineTo(s[i][0] * ss, s[i][1] * ss)
      ctx.stroke(path)
    }
  }, [flattened, regions, graph, palette])

  const valid = displayMmW > 0 && displayMmH > 0
  const showSpinner = !source || !palette || flattening || !flattened
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
            width={flattened ? flattened.width * OUTLINE_SUPERSAMPLE : 1}
            height={flattened ? flattened.height * OUTLINE_SUPERSAMPLE : 1}
            className="block"
            style={{ width: display?.w ?? 0, height: display?.h ?? 0 }}
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
