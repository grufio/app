"use client"

/**
 * Pixelate trace dialog.
 *
 * Layout pattern from shadcn block `sidebar-13` (settings-dialog):
 *   <DialogContent> → <SidebarProvider items-start>
 *     ├── <main h-[560px] flex flex-1 flex-col>   ← Preview canvas
 *     └── <Sidebar side="right" collapsible="none"> ← Form + Footer
 *
 * The hardcoded `h-[560px]` on main is the key: it gives the
 * preview pane a definite height so ResizeObserver can report
 * non-zero dimensions and the canvas actually draws.
 *
 * Three user inputs:
 *   - supercell_width_mm — superpixel width in mm
 *   - supercell_height_mm — superpixel height in mm (rectangular cells)
 *   - num_colors — palette quantisation count (drives preview)
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeftRight,
  ArrowUpDown,
  Loader2,
  Maximize2,
  Palette,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppButton, FormField } from "@/components/ui/form-controls"
import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  MIN_SUPERCELL_MM,
  isPixelateGridValid,
  resolvePixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"
import {
  buildMiniCanvas,
  buildScratchCanvas,
  renderDisplay,
} from "@/lib/editor/trace/pixelate-preview"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

const SCRATCH_MAX_EDGE = 1000
const ZOOM_STEP = 1.5
const ZOOM_MAX_MULTIPLIER = 20

type Props = {
  open: boolean
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
  onClose: () => void
  onSuccess: () => void
  onApplyTrace: (args: {
    kind: RegisteredTraceId
    params: Record<string, unknown>
    displayMmW?: number
    displayMmH?: number
  }) => Promise<void>
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

type ZoomMode = "fit" | "manual"

export function PixelateDialog({
  open,
  sourceImageUrl,
  displayMmW,
  displayMmH,
  onClose,
  onSuccess,
  onApplyTrace,
}: Props) {
  const defaults = useMemo(() => pixelateSchema.parse({}) as PixelateParams, [])
  const [draft, setDraft] = useState<PixelateParams>(defaults)
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof PixelateParams>(key: K, value: PixelateParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const grid = useMemo(
    () => resolvePixelateGrid(displayMmW, displayMmH, draft),
    [displayMmW, displayMmH, draft],
  )
  const valid = isPixelateGridValid(grid)
  const borderSideMmX = grid.borderMmX / 2
  const borderSideMmY = grid.borderMmY / 2

  // --- preview pipeline state ---
  const [scratchData, setScratchData] = useState<{ url: string; canvas: HTMLCanvasElement } | null>(null)
  const scratch = scratchData?.url === sourceImageUrl ? scratchData.canvas : null
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit")
  const [manualZoom, setManualZoom] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const previewPaneRef = useRef<HTMLDivElement | null>(null)
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)

  // Stage 1 + 2: load source image, build scratch canvas
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (cancelled) return
      setScratchData({ url: sourceImageUrl, canvas: buildScratchCanvas(img, SCRATCH_MAX_EDGE) })
    }
    img.onerror = () => {
      if (!cancelled) console.error("Failed to load preview source:", sourceImageUrl)
    }
    img.src = sourceImageUrl
    return () => {
      cancelled = true
    }
  }, [open, sourceImageUrl])

  // ResizeObserver: track preview-pane CSS size.
  useLayoutEffect(() => {
    const el = previewPaneRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      setPreviewSize({ w: rect.width, h: rect.height })
    }
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect
      if (!next) return
      setPreviewSize({ w: Math.max(0, next.width), h: Math.max(0, next.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  // Crop in scratch-pixel space
  const crop = useMemo(() => {
    if (!scratch || !valid || displayMmW <= 0 || displayMmH <= 0) return null
    const mmToScratchPx = scratch.width / displayMmW
    return {
      x: (grid.borderMmX / 2) * mmToScratchPx,
      y: (grid.borderMmY / 2) * mmToScratchPx,
      w: grid.usedMmW * mmToScratchPx,
      h: grid.usedMmH * mmToScratchPx,
    }
  }, [scratch, valid, displayMmW, displayMmH, grid.borderMmX, grid.borderMmY, grid.usedMmW, grid.usedMmH])

  // Stage 3: mini canvas (downsample + quantize)
  const mini = useMemo(() => {
    if (!scratch || !crop || !valid) return null
    return buildMiniCanvas({
      scratch,
      crop,
      cellsX: grid.cellsX,
      cellsY: grid.cellsY,
      numColors: draft.num_colors,
    })
  }, [scratch, crop, valid, grid.cellsX, grid.cellsY, draft.num_colors])

  const fitZoom = useMemo(() => {
    if (!crop || crop.w <= 0 || crop.h <= 0 || previewSize.w <= 0 || previewSize.h <= 0) {
      return 0
    }
    return Math.min(previewSize.w / crop.w, previewSize.h / crop.h)
  }, [crop, previewSize.w, previewSize.h])

  const effectiveZoom = zoomMode === "fit" ? fitZoom : manualZoom
  const dstW = crop ? crop.w * effectiveZoom : 0
  const dstH = crop ? crop.h * effectiveZoom : 0

  const clampedPan = useMemo(
    () => clampPan(pan, dstW, dstH, previewSize.w, previewSize.h),
    [pan, dstW, dstH, previewSize.w, previewSize.h],
  )

  // Stage 4: render display canvas
  useEffect(() => {
    const display = displayCanvasRef.current
    if (!display || !mini || !crop || effectiveZoom <= 0 || previewSize.w <= 0) return
    renderDisplay({
      display,
      mini,
      previewW: previewSize.w,
      previewH: previewSize.h,
      dstW,
      dstH,
      panX: clampedPan.x,
      panY: clampedPan.y,
      dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    })
  }, [mini, crop, effectiveZoom, dstW, dstH, previewSize.w, previewSize.h, clampedPan.x, clampedPan.y])

  // --- pan + zoom interactions ---
  const canPan = zoomMode === "manual" && (dstW > previewSize.w || dstH > previewSize.h)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!canPan) return
      ;(e.target as Element).setPointerCapture(e.pointerId)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPanX: clampedPan.x,
        startPanY: clampedPan.y,
      }
      setDragging(true)
    },
    [canPan, clampedPan.x, clampedPan.y],
  )
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    setPan({
      x: drag.startPanX + (e.clientX - drag.startX),
      y: drag.startPanY + (e.clientY - drag.startY),
    })
  }, [])
  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      ;(e.target as Element).releasePointerCapture(e.pointerId)
      dragRef.current = null
      setDragging(false)
    }
  }, [])

  const handleFit = useCallback(() => {
    setZoomMode("fit")
  }, [])
  const handleZoomIn = useCallback(() => {
    if (fitZoom <= 0) return
    const base = zoomMode === "fit" ? fitZoom : manualZoom
    const next = Math.min(fitZoom * ZOOM_MAX_MULTIPLIER, base * ZOOM_STEP)
    setManualZoom(next)
    setZoomMode("manual")
  }, [fitZoom, manualZoom, zoomMode])
  const handleZoomOut = useCallback(() => {
    if (fitZoom <= 0) return
    const base = zoomMode === "fit" ? fitZoom : manualZoom
    const next = Math.max(fitZoom, base / ZOOM_STEP)
    if (next <= fitZoom + 1e-6) {
      setZoomMode("fit")
    } else {
      setManualZoom(next)
      setZoomMode("manual")
    }
  }, [fitZoom, manualZoom, zoomMode])

  // --- apply / cancel ---
  const handleCancel = () => {
    if (busy) return
    onClose()
  }
  const handleApply = async () => {
    if (busy || !valid) return
    setBusy(true)
    try {
      await onApplyTrace({
        kind: "pixelate",
        params: draft as Record<string, unknown>,
        displayMmW,
        displayMmH,
      })
      onSuccess()
      onClose()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      console.error("Failed to apply trace:", error)
      const formatted = formatOperationErrorForToast(normalizeApiError(error))
      toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
    } finally {
      setBusy(false)
    }
  }

  const showSpinner = !scratch
  const showInvalid = scratch !== null && !valid

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 md:max-h-[640px] md:max-w-[800px] lg:max-w-[900px]">
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b px-4 py-3">
          <DialogTitle className="text-base font-medium">Pixelate</DialogTitle>
          <DialogDescription className="m-0 text-xs text-muted-foreground">
            Bild: {fmt1(displayMmW)} × {fmt1(displayMmH)} mm
          </DialogDescription>
        </DialogHeader>
        <SidebarProvider className="min-h-0">
          <main className="flex h-[420px] flex-1 overflow-hidden">
            <div
              ref={previewPaneRef}
              className="relative h-full w-full overflow-hidden bg-muted"
              style={{ cursor: canPan ? (dragging ? "grabbing" : "grab") : "default" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <canvas
                ref={displayCanvasRef}
                className="absolute inset-0 block"
                style={{ touchAction: "none" }}
              />

              {showSpinner ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Vorschau wird geladen…</span>
                </div>
              ) : null}
              {showInvalid ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">Keine gültige Aufteilung</span>
                </div>
              ) : null}

              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full border bg-background/90 px-1 py-1 shadow-md backdrop-blur">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={handleZoomOut}
                  disabled={!mini || effectiveZoom <= fitZoom + 1e-6}
                  aria-label="Verkleinern"
                >
                  <ZoomOut className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={handleFit}
                  disabled={!mini || zoomMode === "fit"}
                  aria-label="Einpassen"
                >
                  <Maximize2 className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={handleZoomIn}
                  disabled={!mini || effectiveZoom >= fitZoom * ZOOM_MAX_MULTIPLIER - 1e-6}
                  aria-label="Vergrößern"
                >
                  <ZoomIn className="size-4" />
                </Button>
              </div>
            </div>
          </main>
          <Sidebar side="right" collapsible="none" className="hidden md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent className="flex flex-col gap-3 p-2">
                  <FormField
                    variant="numeric"
                    numericMode="decimal"
                    label="Superpixel-Breite"
                    labelVisuallyHidden
                    iconStart={<ArrowLeftRight aria-hidden="true" />}
                    unit="mm"
                    id="supercell_width_mm"
                    value={String(draft.supercell_width_mm)}
                    onCommit={(raw) => {
                      const n = Number(raw)
                      if (Number.isFinite(n)) setField("supercell_width_mm", n)
                    }}
                    disabled={busy}
                    inputProps={{ min: MIN_SUPERCELL_MM, step: 0.5 }}
                  />

                  <FormField
                    variant="numeric"
                    numericMode="decimal"
                    label="Superpixel-Höhe"
                    labelVisuallyHidden
                    iconStart={<ArrowUpDown aria-hidden="true" />}
                    unit="mm"
                    id="supercell_height_mm"
                    value={String(draft.supercell_height_mm)}
                    onCommit={(raw) => {
                      const n = Number(raw)
                      if (Number.isFinite(n)) setField("supercell_height_mm", n)
                    }}
                    disabled={busy}
                    inputProps={{ min: MIN_SUPERCELL_MM, step: 0.5 }}
                  />

                  <FormField
                    variant="numeric"
                    numericMode="int"
                    label="Anzahl Farben"
                    labelVisuallyHidden
                    iconStart={<Palette aria-hidden="true" />}
                    id="num_colors"
                    value={String(draft.num_colors)}
                    onCommit={(raw) => {
                      const n = Number(raw)
                      if (Number.isFinite(n)) setField("num_colors", Math.floor(n))
                    }}
                    disabled={busy}
                    inputProps={{ min: 2, max: 256 }}
                  />

                  {!valid ? (
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-destructive">
                      Superpixel zu groß — kein ganzer Superpixel passt in das Bild.
                      Wähle eine kleinere Superpixel-Breite oder -Höhe.
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Schnitt-Rand: ↔ {fmt1(borderSideMmX)} mm · ↕ {fmt1(borderSideMmY)} mm
                    </div>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="flex flex-row justify-between gap-2 border-t p-3">
              <AppButton type="button" variant="outline" onClick={handleCancel} disabled={busy}>
                Cancel
              </AppButton>
              <AppButton type="button" onClick={() => void handleApply()} disabled={!valid || busy}>
                {busy ? "Applying..." : "Apply"}
              </AppButton>
            </SidebarFooter>
          </Sidebar>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  )
}

function clampPan(
  candidate: { x: number; y: number },
  dstW: number,
  dstH: number,
  previewW: number,
  previewH: number,
): { x: number; y: number } {
  return {
    x:
      dstW <= previewW
        ? (previewW - dstW) / 2
        : Math.min(0, Math.max(previewW - dstW, candidate.x)),
    y:
      dstH <= previewH
        ? (previewH - dstH) / 2
        : Math.min(0, Math.max(previewH - dstH, candidate.y)),
  }
}
