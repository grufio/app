"use client"

/**
 * Line Art trace dialog — same shell as Pixelate / Circulate
 * (`TraceDialogShell`) so the mobile edit-overlay + sticky-footer +
 * 24px-section rhythm is identical. Lineart has no cell-grid (vtracer
 * draws vector paths), so we own the small draft/busy/apply lifecycle
 * inline instead of routing through `CellTraceDialog`. Preview is a
 * client-side K-means approximation (`lineart-preview.ts`); the
 * authoritative SVG comes from the server on Apply.
 */
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { lineartSchema, type LineartParams } from "@/lib/editor/trace/lineart"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { LineArtForm } from "./lineart-form"
import { LineArtPreviewPane } from "./lineart-preview-pane"
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
  onDeleteTrace?: () => void | Promise<void>
  initialParams?: Record<string, unknown>
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

export function LineArtDialog({
  open,
  sourceImageUrl,
  displayMmW,
  displayMmH,
  onClose,
  onSuccess,
  onApplyTrace,
  onDeleteTrace,
  initialParams,
}: Props) {
  // Seed from the active trace's saved params when editing; defaults
  // for the fresh-create flow.
  const defaults = useMemo(
    () => lineartSchema.parse(initialParams ?? {}) as LineartParams,
    [initialParams],
  )
  const [draft, setDraft] = useState<LineartParams>(defaults)
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof LineartParams>(key: K, value: LineartParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const handleCancel = () => {
    if (busy) return
    onClose()
  }

  const handleApply = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onApplyTrace({
        kind: "lineart",
        params: draft as Record<string, unknown>,
      })
      // See cell-trace-dialog.tsx for why we don't call onClose here.
      onSuccess()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      console.error("Failed to apply lineart trace:", error)
      const formatted = formatOperationErrorForToast(normalizeApiError(error))
      toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <TraceDialogShell
      open={open}
      title="Line Art"
      description={`Image: ${fmt1(displayMmW)} × ${fmt1(displayMmH)} mm`}
      metadata={[
        `Image: ${fmt1(displayMmW)} × ${fmt1(displayMmH)} mm`,
        `Colors: up to ${draft.num_colors}`,
        `Mode: ${draft.color_mode === "bw" ? "B/W" : "Color"}`,
      ]}
      preview={
        <LineArtPreviewPane
          sourceImageUrl={sourceImageUrl}
          displayMmW={displayMmW}
          displayMmH={displayMmH}
          params={draft}
        />
      }
      form={<LineArtForm params={draft} onParamsChange={setField} disabled={busy} />}
      valid={true}
      busy={busy}
      onCancel={handleCancel}
      onApply={() => void handleApply()}
      onDeleteTrace={onDeleteTrace}
    />
  )
}
