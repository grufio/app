"use client"

/**
 * Shared dialog shell for cell-grid-based traces (Pixelate, Circulate,
 * and future siblings). Owns:
 *
 *   - draft params (seeded from `schema.parse({})`)
 *   - busy gate during the apply call
 *   - `setField` callback for the form
 *   - grid math (resolved from the live draft via the caller's
 *     `resolveGrid` + validated via `isGridValid`)
 *   - cancel / apply lifecycle with toast-aware error handling
 *   - `TraceDialogShell` composition (title, four-line metadata
 *     readout, preview pane, form)
 *
 * Per-kind divergences (form layout, preview rendering, schema, grid
 * math) come in as props. PixelateDialog / CirculateDialog become
 * thin wrappers that fill the slots.
 *
 * The metadata block is identical across both call sites today —
 * `Image / Grid / Used / Cut` in mm. Both `PixelateGrid` and
 * `CirculateGrid` structurally satisfy `CellGridMetadata` so the
 * shell can read those fields directly.
 *
 * Linerate uses the schema-driven `GenericTraceController` route via
 * `BaseFilterController` + `GenericFilterForm`; it doesn't fit this
 * cell-grid + preview-pane mould, so it stays on its own track.
 */
import { useMemo, useState, type ComponentType } from "react"
import { toast } from "sonner"
import type { z } from "zod"

import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import type { TraceContentRegion } from "@/lib/editor/trace/content-region"

import { TraceDialogShell } from "./trace-dialog-shell"

export type CellGridMetadata = {
  cellsX: number
  cellsY: number
  usedMmW: number
  usedMmH: number
  borderMmX: number
  borderMmY: number
}

export type CellTraceFormProps<P, G> = {
  params: P
  onParamsChange: <K extends keyof P>(key: K, value: P[K]) => void
  disabled: boolean
  grid: G
}

export type CellTracePreviewProps<P> = {
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
  params: P
  /** Optional content-region (artboard − padding) for preview parity with the
   * apply crop. Consumed by the pixelate preview; other panes ignore it. */
  contentRegion?: TraceContentRegion | null
}

export type CellTraceDialogProps<P, G extends CellGridMetadata> = {
  open: boolean
  title: string
  traceKind: RegisteredTraceId
  schema: z.ZodType<P>
  resolveGrid: (displayMmW: number, displayMmH: number, params: P) => G
  isGridValid: (grid: G) => boolean
  Form: ComponentType<CellTraceFormProps<P, G>>
  Preview: ComponentType<CellTracePreviewProps<P>>
  sourceImageUrl: string
  displayMmW: number
  displayMmH: number
  onClose: () => void
  onSuccess: () => void
  onApplyTrace: (args: {
    kind: RegisteredTraceId
    params: Record<string, unknown>
  }) => Promise<void>
  /** Present only when editing the active trace — surfaces the Delete
   * action in the dialog header. */
  onDeleteTrace?: () => void | Promise<void>
  /** Saved params of the active trace; seeds the draft when editing
   * (instead of schema defaults). */
  initialParams?: Record<string, unknown>
  /** Forwarded to the Preview for content-rect crop parity. */
  contentRegion?: TraceContentRegion | null
}

function fmt1(n: number): string {
  return n.toFixed(1)
}

export function CellTraceDialog<P extends Record<string, unknown>, G extends CellGridMetadata>(
  props: CellTraceDialogProps<P, G>,
) {
  const {
    open,
    title,
    traceKind,
    schema,
    resolveGrid,
    isGridValid,
    Form,
    Preview,
    sourceImageUrl,
    displayMmW,
    displayMmH,
    onClose,
    onSuccess,
    onApplyTrace,
    onDeleteTrace,
    initialParams,
    contentRegion,
  } = props

  // Seed from the active trace's saved params when editing (parsing
  // fills any missing field with its default); schema defaults for the
  // fresh-create flow.
  const defaults = useMemo(() => schema.parse(initialParams ?? {}) as P, [schema, initialParams])
  const [draft, setDraft] = useState<P>(defaults)
  const [busy, setBusy] = useState(false)

  const setField = <K extends keyof P>(key: K, value: P[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  // When a content region is present (pixelate content-rect crop), the whole
  // dialog — grid math, metadata, preview — runs on the CONTENT-rect mm so it
  // matches what the apply path traces (not the full image mm).
  const effMmW = contentRegion?.displayMmW ?? displayMmW
  const effMmH = contentRegion?.displayMmH ?? displayMmH
  const grid = useMemo(
    () => resolveGrid(effMmW, effMmH, draft),
    [resolveGrid, effMmW, effMmH, draft],
  )
  const valid = isGridValid(grid)

  const handleCancel = () => {
    if (busy) return
    onClose()
  }
  const handleApply = async () => {
    if (busy || !valid) return
    setBusy(true)
    try {
      await onApplyTrace({
        kind: traceKind,
        params: draft as Record<string, unknown>,
      })
      // `onSuccess` resets the trace dialog state machine to idle
      // which unmounts this component — calling `onClose` afterwards
      // would also fire the cancel-path side effects (section reset).
      onSuccess()
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
      title={title}
      description={`Image: ${fmt1(effMmW)} × ${fmt1(effMmH)} mm`}
      metadata={[
        `Image: ${fmt1(effMmW)} × ${fmt1(effMmH)} mm`,
        `Grid: ${grid.cellsX} × ${grid.cellsY} cells`,
        `Used: ${fmt1(grid.usedMmW)} × ${fmt1(grid.usedMmH)} mm`,
        `Cut: ${fmt1(grid.borderMmX)} × ${fmt1(grid.borderMmY)} mm`,
      ]}
      preview={
        <Preview
          sourceImageUrl={sourceImageUrl}
          displayMmW={displayMmW}
          displayMmH={displayMmH}
          params={draft}
          contentRegion={contentRegion}
        />
      }
      form={<Form params={draft} onParamsChange={setField} disabled={busy} grid={grid} />}
      valid={valid}
      busy={busy}
      onCancel={handleCancel}
      onApply={() => void handleApply()}
      onDeleteTrace={onDeleteTrace}
    />
  )
}
