"use client"

/**
 * Trace dialog host. Sister to `EditorDialogHost`. Mounts the
 * `TraceSelectionController` (trace picker) and, once a kind is chosen, the
 * appropriate configure surface:
 *   - pixelate    → `PixelateDialog`
 *   - circulate   → `CirculateDialog`
 *   - other kinds → `GenericTraceController`
 */
import { TraceSelectionController } from "@/features/editor/components/TraceSelectionController"
import { CirculateDialog } from "@/features/editor/components/trace-forms/circulate-dialog"
import { GenericTraceController } from "@/features/editor/components/trace-forms/generic-trace-controller"
import { LinerateDialog } from "@/features/editor/components/trace-forms/linerate-dialog"
import { PixelateDialog } from "@/features/editor/components/trace-forms/pixelate-dialog"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import type { TraceContentRegion } from "@/lib/editor/trace/content-region"

export function EditorTraceDialogHost(props: {
  selectionOpen: boolean
  activeKind: RegisteredTraceId | null
  traceDialogSource: {
    sourceImageUrl: string
    sourceImageWidth: number
    sourceImageHeight: number
    displayMmW: number
    displayMmH: number
    contentRegion?: TraceContentRegion | null
  } | null
  onCloseSelection: () => void
  onSelectKind: (kind: RegisteredTraceId) => void
  onCloseConfigure: () => void
  /** Called after a successful trace apply (e.g. to reset the dialog
   * session). The shell wires `traceDialog.reset` here. */
  onApplied: () => void
  onApplyTrace: (args: {
    kind: RegisteredTraceId
    params: Record<string, unknown>
  }) => Promise<void>
  /** Linerate dialog preview: run the server trace at 0.5 MP and return the
   * un-persisted SVG string. Only the LinerateDialog consumes it. */
  onPreviewTrace: (args: {
    kind: RegisteredTraceId
    params: Record<string, unknown>
  }) => Promise<string>
  /** Saved params of the active trace, used to seed the configure form
   * when editing. Undefined for the new-trace flow (schema defaults). */
  initialParams?: Record<string, unknown>
}) {
  const {
    selectionOpen,
    activeKind,
    traceDialogSource,
    onCloseSelection,
    onSelectKind,
    onCloseConfigure,
    onApplied,
    onApplyTrace,
    onPreviewTrace,
    initialParams,
  } = props

  const configureOpen = Boolean(traceDialogSource && activeKind)

  return (
    <>
      <TraceSelectionController
        workingImageUrl={traceDialogSource?.sourceImageUrl ?? null}
        open={selectionOpen}
        onClose={onCloseSelection}
        onSelect={onSelectKind}
      />
      {/*
        No `onError` override: the wizards toast the failure themselves.
        A host-side console-only handler would silently hide server
        errors from the user.
      */}
      {configureOpen && traceDialogSource && activeKind === "pixelate" ? (
        <PixelateDialog
          open
          sourceImageUrl={traceDialogSource.sourceImageUrl}
          displayMmW={traceDialogSource.displayMmW}
          displayMmH={traceDialogSource.displayMmH}
          contentRegion={traceDialogSource.contentRegion ?? null}
          onClose={onCloseConfigure}
          onSuccess={onApplied}
          onApplyTrace={onApplyTrace}
          initialParams={initialParams}
        />
      ) : null}
      {configureOpen && traceDialogSource && activeKind === "circulate" ? (
        <CirculateDialog
          open
          sourceImageUrl={traceDialogSource.sourceImageUrl}
          displayMmW={traceDialogSource.displayMmW}
          displayMmH={traceDialogSource.displayMmH}
          contentRegion={traceDialogSource.contentRegion ?? null}
          onClose={onCloseConfigure}
          onSuccess={onApplied}
          onApplyTrace={onApplyTrace}
          initialParams={initialParams}
        />
      ) : null}
      {configureOpen && traceDialogSource && activeKind === "linerate" ? (
        <LinerateDialog
          open
          sourceImageUrl={traceDialogSource.sourceImageUrl}
          displayMmW={traceDialogSource.displayMmW}
          displayMmH={traceDialogSource.displayMmH}
          contentRegion={traceDialogSource.contentRegion ?? null}
          onClose={onCloseConfigure}
          onSuccess={onApplied}
          onApplyTrace={onApplyTrace}
          onPreviewTrace={onPreviewTrace}
          initialParams={initialParams}
        />
      ) : null}
      {configureOpen
      && traceDialogSource
      && activeKind
      && activeKind !== "pixelate"
      && activeKind !== "circulate"
      && activeKind !== "linerate" ? (
        <GenericTraceController
          kind={activeKind}
          ctx={{
            imageWidth: traceDialogSource.sourceImageWidth,
            imageHeight: traceDialogSource.sourceImageHeight,
          }}
          open
          onClose={onCloseConfigure}
          onSuccess={onApplied}
          onApplyTrace={onApplyTrace}
          initialParams={initialParams}
        />
      ) : null}
    </>
  )
}
