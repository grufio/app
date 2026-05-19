"use client"

/**
 * Pixelate trace dialog.
 *
 * Single-form dialog (no wizard steps). Three user inputs:
 *   - supercell_width_mm — superpixel width in mm
 *   - supercell_height_mm — superpixel height in mm (rectangular cells)
 *   - num_colors — palette quantisation count
 *
 * Stroke width is fixed at 1px server-side. Cell count derives from
 * the image's displayed size on the artboard (passed in as
 * `displayMmW`/`displayMmH`) divided by the supercell axis dimensions.
 * Whatever doesn't divide into a whole superpixel is a centred border
 * that gets cropped at trace time — shown live in the dialog footer.
 */
import { useMemo, useState } from "react"
import { ArrowLeftRight, ArrowUpDown, Palette } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AppButton, FormField } from "@/components/ui/form-controls"
import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import {
  MIN_SUPERCELL_MM,
  isPixelateGridValid,
  resolvePixelateGrid,
} from "@/lib/editor/trace/pixelate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

type Props = {
  open: boolean
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
  // The full leftover per axis is split evenly into a centred border;
  // surfacing each side keeps "wieviel wird abgeschnitten" readable.
  const borderSideMmX = grid.borderMmX / 2
  const borderSideMmY = grid.borderMmY / 2

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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pixelate</DialogTitle>
          <DialogDescription>
            Bild: {fmt1(displayMmW)} × {fmt1(displayMmH)} mm
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
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
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <AppButton type="button" variant="outline" onClick={handleCancel} disabled={busy}>
            Cancel
          </AppButton>
          <AppButton type="button" onClick={() => void handleApply()} disabled={!valid || busy}>
            {busy ? "Applying..." : "Apply"}
          </AppButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}
