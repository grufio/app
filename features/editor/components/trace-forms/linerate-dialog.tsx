"use client"

/**
 * Linerate trace dialog — the SAME shell as Pixelate / Circulate
 * (`TraceDialogShell`), so the layout, header, sticky footer and 24px section
 * rhythm are identical. Like them it has no cell grid, so we own the small
 * draft/busy/apply lifecycle inline. The preview is a fast client-side colour
 * approximation (`LineratePreviewPane`); the authoritative smooth, watertight
 * SVG comes from the server on Apply.
 */
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { linerateSchema, type LinerateParams } from "@/lib/editor/trace/linerate"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { LinerateForm } from "./linerate-form"
import { LineratePreviewPane } from "./linerate-preview-pane"
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

export function LinerateDialog({
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
  const defaults = useMemo(
    () => linerateSchema.parse(initialParams ?? {}) as LinerateParams,
    [initialParams],
  )
  const [draft, setDraft] = useState<LinerateParams>(defaults)
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof LinerateParams>(key: K, value: LinerateParams[K]) =>
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
        kind: "linerate",
        params: draft as Record<string, unknown>,
      })
      onSuccess()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      console.error("Failed to apply linerate trace:", error)
      const formatted = formatOperationErrorForToast(normalizeApiError(error))
      toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <TraceDialogShell
      open={open}
      title="Linerate"
      description={`Image: ${fmt1(displayMmW)} × ${fmt1(displayMmH)} mm`}
      metadata={[
        `Image: ${fmt1(displayMmW)} × ${fmt1(displayMmH)} mm`,
        `Colors: up to ${draft.num_colors}`,
        `Mode: ${draft.color_mode === "bw" ? "B/W" : "Color"}`,
      ]}
      preview={
        <LineratePreviewPane
          sourceImageUrl={sourceImageUrl}
          displayMmW={displayMmW}
          displayMmH={displayMmH}
          params={draft}
        />
      }
      form={<LinerateForm params={draft} onParamsChange={setField} disabled={busy} />}
      valid={true}
      busy={busy}
      onCancel={handleCancel}
      onApply={() => void handleApply()}
      onDeleteTrace={onDeleteTrace}
    />
  )
}
