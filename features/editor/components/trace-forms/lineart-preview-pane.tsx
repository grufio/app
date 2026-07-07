"use client"

/**
 * Line Art preview pane: a downscaled, client-side render of the vtracer
 * pipeline. It runs the SAME vtracer engine as the server (WebAssembly, via
 * `lineart-vtracer-wasm.ts`), so the preview shows smooth spline region
 * outlines that match the Apply result — the classic paint-by-numbers look —
 * instead of the old jagged K-means raster.
 *
 * Pipeline (mirrors `filter-service/app/lineart.py`):
 *   1. Downscale source to ≤384px edge (`loadAndDownscale`)
 *   2. Gaussian blur with `blur_amount`
 *   3. K-means OKLab quantise to `num_colors` → flat quantised RGBA
 *      (`quantizedRgbaFromClusters`)
 *   4. WASM vtracer (color / spline / cutout, `smoothness`-derived params)
 *      → region SVG  [async, debounced, spinner]
 *   5. Snap each region's fill to the active Munsell palette + add a black
 *      stroke → `<g id="regions">` SVG (`buildLineartPreviewSvg`)
 *   6. Render as an inline DOM SVG (stretches to the display rect via
 *      `preserveAspectRatio="none"`)
 *
 * The expensive step (4, the trace) re-runs only on `blur_amount` /
 * `num_colors` / `smoothness`; `line_thickness` + `color_mode` only re-run the
 * cheap fill-snap + stroke step (5), so they update instantly.
 *
 * Pane sizing + zoom controls mirror `pixelate-preview-pane.tsx`. NOT
 * pixel-perfect to the server (K-means vs. median-cut quantise, downscaled),
 * but the same smooth style; Apply uses the authoritative server pipeline.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { LineartParams } from "@/lib/editor/trace/lineart"
import {
  buildLineartPreviewSvg,
  gaussianBlur,
  kMeansOklab,
  loadAndDownscale,
  quantizedRgbaFromClusters,
} from "@/lib/editor/trace/lineart-preview"
import { traceRgbaToSvg } from "@/lib/editor/trace/lineart-vtracer-wasm"
import { useSourceImage } from "@/lib/editor/trace/use-source-image"
import { useTracePalette } from "@/lib/editor/trace/use-trace-palette"

// 384px working buffer: a good trade between vtracer curve fidelity and the
// ~30-100ms trace time (kept off the critical path via debounce + spinner).
const MAX_PREVIEW_EDGE_PX = 384
const KMEANS_MAX_ITER = 10
// Debounce the trace so dragging a slider doesn't fire a trace per tick.
const TRACE_DEBOUNCE_MS = 180

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

  // Stage 1: downscale source to a working buffer (≤384px edge).
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

  // Stage 3: K-means quantise → flat colour-reduced RGBA for vtracer.
  const quantizedRgba = useMemo(() => {
    if (!blurred) return null
    const { centroids, assignments } = kMeansOklab(blurred, params.num_colors, KMEANS_MAX_ITER)
    if (centroids.length === 0) return null
    const rgba = quantizedRgbaFromClusters({
      image: blurred,
      assignments,
      clusterCount: centroids.length,
    })
    return { rgba, width: blurred.width, height: blurred.height }
  }, [blurred, params.num_colors])

  // Stage 4: WASM vtracer — async, debounced. Re-runs only on the quantised
  // buffer (blur / num_colors) or smoothness. A sequence guard drops stale
  // results so a fast slider drag always ends on the latest trace.
  const [rawSvg, setRawSvg] = useState<string | null>(null)
  const [tracing, setTracing] = useState(false)
  const traceSeq = useRef(0)
  useEffect(() => {
    // No input yet → nothing to trace. `finalSvg` already gates on
    // `quantizedRgba`, so the stale `rawSvg` is harmless (never rendered).
    if (!quantizedRgba) return
    const seq = (traceSeq.current += 1)
    // `setTracing` runs inside the debounce timeout (not synchronously in the
    // effect body) so the spinner reflects the actual trace, and a rapid slider
    // drag doesn't churn state on every tick.
    const handle = setTimeout(() => {
      setTracing(true)
      traceRgbaToSvg({
        rgba: quantizedRgba.rgba,
        width: quantizedRgba.width,
        height: quantizedRgba.height,
        smoothness: params.smoothness,
      })
        .then((svg) => {
          if (seq !== traceSeq.current) return
          setRawSvg(svg)
          setTracing(false)
        })
        .catch((err) => {
          if (seq !== traceSeq.current) return
          console.error("Line Art preview trace failed:", err)
          setTracing(false)
        })
    }, TRACE_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [quantizedRgba, params.smoothness])

  // Stroke width in viewBox units: scale line_thickness by the downscale ratio
  // so the on-screen line matches the full-res Apply result at the same zoom
  // (an unscaled value renders several times too fat in the smaller viewBox).
  const strokeWidth = useMemo(() => {
    if (!blurred || !source || source.naturalWidth <= 0) return params.line_thickness
    return Math.max(0.15, params.line_thickness * (blurred.width / source.naturalWidth))
  }, [blurred, source, params.line_thickness])

  // Stage 5: snap fills + add strokes → final SVG. Cheap + synchronous, so
  // line_thickness / color_mode (palette) changes update without a re-trace.
  const finalSvg = useMemo(() => {
    if (!rawSvg || !quantizedRgba || !palette) return null
    return buildLineartPreviewSvg({
      vtracerSvg: rawSvg,
      width: quantizedRgba.width,
      height: quantizedRgba.height,
      palette,
      strokeWidth,
    }).svg
  }, [rawSvg, quantizedRgba, palette, strokeWidth])

  const valid = displayMmW > 0 && displayMmH > 0
  // Big spinner while the source/palette load or the first trace is pending;
  // once a preview exists, a re-trace shows the small overlay spinner instead
  // of blanking the pane.
  const showSpinner = !source || !palette || (!finalSvg && valid) || tracing
  const showInvalid = source !== null && palette !== null && !valid

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
          <div
            className="block"
            style={{ width: display?.w ?? 0, height: display?.h ?? 0, lineHeight: 0 }}
            data-testid="lineart-preview-mini"
          >
            {finalSvg ? (
              <div
                style={{ width: "100%", height: "100%" }}
                data-testid="lineart-preview-svg"
                dangerouslySetInnerHTML={{ __html: finalSvg }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {showSpinner ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {!source || !palette ? "Loading preview…" : "Tracing…"}
          </span>
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
