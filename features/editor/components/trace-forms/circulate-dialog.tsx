"use client"

/**
 * Circulate trace dialog — thin shell: owns the draft params + apply lifecycle
 * and delegates layout to `TraceDialogShell` (desktop sidebar / mobile
 * fullscreen + params dialog). Composes the preview pane, the 3-segment form,
 * and the header size readout.
 */
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { circulateSchema, type CirculateParams } from "@/lib/editor/trace/circulate"
import { isCirculateGridValid, resolveCirculateGrid } from "@/lib/editor/trace/circulate-grid-math"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { CirculateForm } from "./circulate-form"
import { CirculatePreviewPane } from "./circulate-preview-pane"
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

export function CirculateDialog({
  open,
  sourceImageUrl,
  displayMmW,
  displayMmH,
  onClose,
  onSuccess,
  onApplyTrace,
}: Props) {
  const defaults = useMemo(() => circulateSchema.parse({}) as CirculateParams, [])
  const [draft, setDraft] = useState<CirculateParams>(defaults)
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof CirculateParams>(key: K, value: CirculateParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const grid = useMemo(
    () => resolveCirculateGrid(displayMmW, displayMmH, draft),
    [displayMmW, displayMmH, draft],
  )
  const valid = isCirculateGridValid(grid)

  const handleCancel = () => {
    if (busy) return
    onClose()
  }
  const handleApply = async () => {
    if (busy || !valid) return
    setBusy(true)
    try {
      await onApplyTrace({
        kind: "circulate",
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
      title="Circulate"
      description={`Bild: ${fmt1(displayMmW)} × ${fmt1(displayMmH)} mm`}
      metadata={
        <>
          <span>Image: {fmt1(displayMmW)} × {fmt1(displayMmH)} mm</span>
          <span className="mx-2">·</span>
          <span>Grid: {grid.cellsX} × {grid.cellsY} cells</span>
          <span className="mx-2">·</span>
          <span>Used: {fmt1(grid.usedMmW)} × {fmt1(grid.usedMmH)} mm</span>
          <span className="mx-2">·</span>
          <span>Cut: {fmt1(grid.borderMmX)} × {fmt1(grid.borderMmY)} mm</span>
        </>
      }
      preview={
        <CirculatePreviewPane
          sourceImageUrl={sourceImageUrl}
          displayMmW={displayMmW}
          displayMmH={displayMmH}
          params={draft}
        />
      }
      form={<CirculateForm params={draft} onParamsChange={setField} disabled={busy} grid={grid} />}
      valid={valid}
      busy={busy}
      onCancel={handleCancel}
      onApply={() => void handleApply()}
    />
  )
}
