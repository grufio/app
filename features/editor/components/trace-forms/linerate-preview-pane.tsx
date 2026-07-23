"use client"

/**
 * Linerate preview pane — renders the SAME server trace as Apply, run at
 * 0.5 MP (no persist). The pane calls `onPreview()` (a server round-trip through
 * `previewProjectTrace`) once per `generation` and renders the returned SVG
 * string inline, mirroring the circulate/pixelate preview panes
 * (`dangerouslySetInnerHTML` into a contain-fit + zoom display box). Each Preview
 * tap bumps `generation` so the pane re-runs with the current draft WITHOUT a
 * remount. No client-side segmentation — the preview and Apply share one
 * implementation, so the region structure matches (only the edges are coarser at
 * 0.5 MP).
 *
 * Pane sizing + zoom controls mirror the sibling trace preview panes.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { prepareTraceSvg } from "@/features/editor/components/canvas-stage/prepare-trace-svg"

const ZOOM_STEP = 1.5
const ZOOM_MIN = 1
const ZOOM_MAX = 8

type Props = {
  displayMmW: number
  displayMmH: number
  /** Runs the server trace at 0.5 MP and resolves with the SVG string. Called
   * once per `generation` — reads the current draft at call time. */
  onPreview: () => Promise<string>
  /** Bumped by the dialog on each Preview tap; the preview re-runs on change
   * (no remount). */
  generation: number
}

export function LineratePreviewPane({ displayMmW, displayMmH, onPreview, generation }: Props) {
  const paneRef = useRef<HTMLDivElement | null>(null)
  const [pane, setPane] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [svgText, setSvgText] = useState<string | null>(null)
  // The generation whose result is currently settled. `loading` is derived:
  // the pane is loading whenever the settled generation trails the requested
  // one. Deriving it (instead of a synchronous setState at the top of the
  // effect) keeps the re-run spinner without a cascading-render setState.
  const [settledGeneration, setSettledGeneration] = useState<number | null>(null)
  const loading = settledGeneration !== generation

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

  // Run the server preview once per generation. `onPreview` reads the current
  // draft at call time — the preview is a deliberate on-tap recompute (each run
  // is a Cloud-Run round-trip), not a live per-keystroke one.
  useEffect(() => {
    let cancelled = false
    onPreview()
      .then((svg) => {
        if (!cancelled) setSvgText(svg)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const error = e instanceof Error ? e : new Error(String(e))
        const formatted = formatOperationErrorForToast(normalizeApiError(error))
        toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
      })
      .finally(() => {
        if (!cancelled) setSettledGeneration(generation)
      })
    return () => {
      cancelled = true
    }
    // Re-run on each generation bump; `onPreview` is stable and reads the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation])

  // Prepare the SVG for inline injection (strip xml decl, size to 100%,
  // annotate paths) — the same preparation the canvas overlay uses.
  const svgHtml = useMemo(() => (svgText ? prepareTraceSvg(svgText)?.html ?? null : null), [svgText])

  const valid = displayMmW > 0 && displayMmH > 0
  const showSpinner = loading
  const showInvalid = !loading && svgText !== null && !valid

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
          <div
            className="relative block"
            style={{ width: display?.w ?? 0, height: display?.h ?? 0, lineHeight: 0 }}
            data-testid="linerate-preview-mini"
            {...(svgHtml ? { dangerouslySetInnerHTML: { __html: svgHtml } } : {})}
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

      {svgHtml && valid ? (
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
