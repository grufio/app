"use client"

/**
 * Linerate trace dialog — the SAME shell as Pixelate / Circulate
 * (`TraceDialogShell`), so the layout, header, sticky footer and 24px section
 * rhythm are identical. Like them it has no cell grid, so we own the small
 * draft/busy/apply lifecycle inline. The preview IS the same server trace as
 * Apply, run at 0.5 MP (no persist); the pane renders the returned SVG. Each
 * Preview tap bumps a generation counter (the pane re-runs on it, no remount)
 * and records the previewed params; the Preview button hides while the draft
 * still matches the last-previewed params (nothing to re-render).
 */
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import type { TraceContentRegion } from "@/lib/editor/trace/content-region"
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
  /** Content region (artboard − padding) — the crop the final trace uses. The
   * preview sizes its box to this so its aspect matches Apply (no distortion). */
  contentRegion?: TraceContentRegion | null
  onClose: () => void
  onSuccess: () => void
  onApplyTrace: (args: {
    kind: RegisteredTraceId
    params: Record<string, unknown>
  }) => Promise<void>
  /** Run the server trace at 0.5 MP and return the un-persisted SVG string. The
   * preview pane calls this on each preview generation and renders the SVG. */
  onPreviewTrace: (args: {
    kind: RegisteredTraceId
    params: Record<string, unknown>
  }) => Promise<string>
  onDeleteTrace?: () => void | Promise<void>
  initialParams?: Record<string, unknown>
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

export function LinerateDialog({
  open,
  displayMmW,
  displayMmH,
  contentRegion,
  onClose,
  onSuccess,
  onApplyTrace,
  onPreviewTrace,
  onDeleteTrace,
  initialParams,
}: Props) {
  const defaults = useMemo(
    () => linerateSchema.parse(initialParams ?? {}) as LinerateParams,
    [initialParams],
  )
  const [draft, setDraft] = useState<LinerateParams>(defaults)
  const [busy, setBusy] = useState(false)

  // Preview generation: bumped on each Preview tap so the (kept-mounted) pane
  // re-runs the server preview with the CURRENT draft — no remount. Paired with
  // the params snapshot that was last previewed, which drives `previewDirty`.
  //
  // Baseline: when EDITING an existing applied trace (`initialParams` present),
  // seed it with the applied params so an unchanged dialog is not dirty →
  // previewing the already-applied result is pointless, so Preview is disabled.
  // For a NEW trace (no `initialParams` → nothing applied yet), seed `null` so
  // the draft is dirty → Preview is enabled straight away (you must be able to
  // preview before the first apply, incl. right after deleting a trace).
  const [previewGeneration, setPreviewGeneration] = useState(0)
  const [lastPreviewedParams, setLastPreviewedParams] = useState<LinerateParams | null>(
    initialParams != null ? defaults : null,
  )

  const setField = <K extends keyof LinerateParams>(key: K, value: LinerateParams[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  // Runs the server preview with the CURRENT draft. Recreated when the draft
  // changes; the pane's effect (keyed on the generation) reads whichever
  // closure is bound at the render that committed the new generation — which is
  // always the latest draft, since a Preview tap follows the field commits.
  const runPreview = useCallback(
    () => onPreviewTrace({ kind: "linerate", params: draft as Record<string, unknown> }),
    [onPreviewTrace, draft],
  )

  // The draft params are flat primitives, so JSON.stringify is a sound deep
  // compare. `null` baseline (new trace, nothing previewed yet) → always dirty →
  // Preview enabled; otherwise dirty iff the draft differs from the last-previewed
  // params, so Preview re-enables only after a real change and disables again once
  // that change has been previewed.
  const previewDirty = lastPreviewedParams === null || JSON.stringify(draft) !== JSON.stringify(lastPreviewedParams)

  const handlePreviewRequested = useCallback(() => {
    setPreviewGeneration((g) => g + 1)
    setLastPreviewedParams(draft)
  }, [draft])

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
          displayMmW={displayMmW}
          displayMmH={displayMmH}
          contentRegion={contentRegion}
          onPreview={runPreview}
          generation={previewGeneration}
        />
      }
      form={<LinerateForm params={draft} onParamsChange={setField} disabled={busy} />}
      valid={true}
      busy={busy}
      onCancel={handleCancel}
      onApply={() => void handleApply()}
      onDeleteTrace={onDeleteTrace}
      canPreview={previewDirty}
      onPreviewRequested={handlePreviewRequested}
    />
  )
}
