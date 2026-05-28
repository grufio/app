"use client"

/**
 * Pixelate trace dialog — thin shell: owns draft params + apply lifecycle and
 * delegates layout to `TraceDialogShell` (desktop sidebar / mobile fullscreen
 * + params dialog). Composes the preview pane, the form, and the header
 * size readout.
 */
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { pixelateSchema, type PixelateParams } from "@/lib/editor/trace/pixelate"
import { isPixelateGridValid, resolvePixelateGrid } from "@/lib/editor/trace/pixelate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { PixelateForm } from "./pixelate-form"
import { PixelatePreviewPane } from "./pixelate-preview-pane"
import { TraceDialogShell } from "./trace-dialog-shell"

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
    <TraceDialogShell
      open={open}
      title="Pixelate"
      description={`Image: ${fmt1(displayMmW)} × ${fmt1(displayMmH)} mm`}
      metadata={[
        `Image: ${fmt1(displayMmW)} × ${fmt1(displayMmH)} mm`,
        `Grid: ${grid.cellsX} × ${grid.cellsY} cells`,
        `Used: ${fmt1(grid.usedMmW)} × ${fmt1(grid.usedMmH)} mm`,
        `Cut: ${fmt1(grid.borderMmX)} × ${fmt1(grid.borderMmY)} mm`,
      ]}
      preview={
        <PixelatePreviewPane
          sourceImageUrl={sourceImageUrl}
          displayMmW={displayMmW}
          displayMmH={displayMmH}
          params={draft}
        />
      }
      form={
        <PixelateForm
          params={draft}
          onParamsChange={setField}
          disabled={busy}
          grid={grid}
        />
      }
      valid={valid}
      busy={busy}
      onCancel={handleCancel}
      onApply={() => void handleApply()}
    />
  )
}
