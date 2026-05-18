"use client"

/**
 * Numerate trace dialog.
 *
 * Single-form dialog (no wizard steps). Two user inputs:
 *   - supercell_mm — superpixel edge length in mm
 *   - num_colors — palette quantisation count
 *
 * Stroke width is fixed at 1px server-side. Cell count derives from
 * the image's displayed size on the artboard (passed in as
 * `displayMmW`/`displayMmH`) divided by `supercell_mm`. Whatever
 * doesn't divide into a whole superpixel is a centred border that
 * gets cropped at trace time.
 */
import { useMemo, useState } from "react"
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
import { numerateSchema, type NumerateParams } from "@/lib/editor/trace/numerate"
import {
  MIN_SUPERCELL_MM,
  isNumerateGridValid,
  resolveNumerateGrid,
} from "@/lib/editor/trace/numerate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

type Props = {
  open: boolean
  displayMmW: number
  displayMmH: number
  onClose: () => void
  onSuccess: () => void
  onApplyTrace: (args: { kind: RegisteredTraceId; params: Record<string, unknown> }) => Promise<void>
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

export function NumerateDialog({
  open,
  displayMmW,
  displayMmH,
  onClose,
  onSuccess,
  onApplyTrace,
}: Props) {
  const defaults = useMemo(() => numerateSchema.parse({}) as NumerateParams, [])
  const [draft, setDraft] = useState<NumerateParams>(defaults)
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof NumerateParams>(key: K, value: NumerateParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const grid = useMemo(
    () => resolveNumerateGrid(displayMmW, displayMmH, draft),
    [displayMmW, displayMmH, draft],
  )
  const valid = isNumerateGridValid(grid)

  const handleCancel = () => {
    if (busy) return
    onClose()
  }

  const handleApply = async () => {
    if (busy || !valid) return
    setBusy(true)
    try {
      await onApplyTrace({ kind: "numerate", params: draft as Record<string, unknown> })
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
          <DialogTitle>Numerate</DialogTitle>
          <DialogDescription>
            Bild: {fmt1(displayMmW)} × {fmt1(displayMmH)} mm
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <FormField
            variant="numeric"
            numericMode="decimal"
            label="Superpixel-Breite (mm)"
            id="supercell_mm"
            value={String(draft.supercell_mm)}
            onCommit={(raw) => {
              const n = Number(raw)
              if (Number.isFinite(n)) setField("supercell_mm", n)
            }}
            disabled={busy}
            inputProps={{ min: MIN_SUPERCELL_MM, step: 0.5 }}
          />

          <FormField
            variant="numeric"
            numericMode="int"
            label="Anzahl Farben"
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
              Wähle eine kleinere Superpixel-Breite.
            </div>
          ) : null}
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
