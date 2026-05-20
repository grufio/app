"use client"

/**
 * Pixelate trace dialog — strict shadcn `sidebar-13` (settings-dialog)
 * pattern. DialogContent wraps a SidebarProvider with main + right
 * Sidebar; the title sits in a header inside main, the form lives in
 * the Sidebar, action buttons in SidebarFooter.
 *
 * Preview rendering: the mini canvas (cellsX × cellsY bitmap, drawn
 * by `buildMiniCanvas`) is displayed directly via CSS
 * `image-rendering: pixelated`. The browser handles nearest-neighbour
 * upscale to display size, so no JS-side measurement of the preview
 * pane is needed.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftRight, ArrowUpDown, Loader2, Palette } from "lucide-react"
import { toast } from "sonner"

import { AspectRatio } from "@/components/ui/aspect-ratio"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { buildMiniCanvas, buildScratchCanvas } from "@/lib/editor/trace/pixelate-preview"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

const SCRATCH_MAX_EDGE = 1000

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

  const [scratchData, setScratchData] = useState<{ url: string; canvas: HTMLCanvasElement } | null>(null)
  const scratch = scratchData?.url === sourceImageUrl ? scratchData.canvas : null

  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)

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

  // Crop in scratch-pixel space (border-trim symmetric on both axes)
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

  // Stage 3: draw mini canvas (cellsX × cellsY, quantized). React
  // owns target.width/height via JSX props on the <canvas> below;
  // this effect only redraws the bitmap when inputs change.
  useEffect(() => {
    const target = miniCanvasRef.current
    if (!target || !scratch || !crop || !valid) return
    buildMiniCanvas({
      target,
      scratch,
      crop,
      cellsX: grid.cellsX,
      cellsY: grid.cellsY,
      numColors: draft.num_colors,
    })
  }, [scratch, crop, valid, grid.cellsX, grid.cellsY, draft.num_colors])

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
      <DialogContent className="overflow-hidden p-0 md:max-h-[680px] md:max-w-[800px]">
        <DialogTitle className="sr-only">Pixelate</DialogTitle>
        <DialogDescription className="sr-only">
          Bild: {fmt1(displayMmW)} × {fmt1(displayMmH)} mm
        </DialogDescription>

        <SidebarProvider
          className="items-start"
          style={{ "--sidebar-width": "200px" } as React.CSSProperties}
        >
          <main className="flex flex-1 flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
              <span className="text-sm font-medium">Pixelate</span>
              <span className="text-xs text-muted-foreground">
                Bild: {fmt1(displayMmW)} × {fmt1(displayMmH)} mm
              </span>
            </header>
            <AspectRatio ratio={1} className="overflow-hidden bg-muted">
              <div className="relative size-full">
                <canvas
                  ref={miniCanvasRef}
                  width={grid.cellsX}
                  height={grid.cellsY}
                  className="block"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    imageRendering: "pixelated",
                  }}
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
              </div>
            </AspectRatio>
          </main>

          <Sidebar side="right" collapsible="none" className="hidden md:flex">
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent className="flex flex-col gap-3 p-3">
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
