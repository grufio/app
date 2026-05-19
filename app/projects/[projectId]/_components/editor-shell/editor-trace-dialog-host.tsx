"use client"

/**
 * Trace dialog host. Sister to `EditorDialogHost`. Mounts the
 * `TraceSelectionController` (pixelate vs lineart picker) and,
 * once a kind is chosen, the appropriate configure surface:
 *   - pixelate → `PixelateDialog`
 *   - lineart  → single-form `GenericTraceController`
 */
import { TraceSelectionController } from "@/features/editor/components/TraceSelectionController"
import { GenericTraceController } from "@/features/editor/components/trace-forms/generic-trace-controller"
import { PixelateDialog } from "@/features/editor/components/trace-forms/pixelate-dialog"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export function EditorTraceDialogHost(props: {
  selectionOpen: boolean
  activeKind: RegisteredTraceId | null
  traceDialogSource: {
    sourceImageUrl: string
    sourceImageWidth: number
    sourceImageHeight: number
    displayMmW: number
    displayMmH: number
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
    displayMmW?: number
    displayMmH?: number
  }) => Promise<void>
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
          onClose={onCloseConfigure}
          onSuccess={onApplied}
          onApplyTrace={onApplyTrace}
        />
      ) : null}
      {configureOpen && traceDialogSource && activeKind && activeKind !== "pixelate" ? (
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
        />
      ) : null}
    </>
  )
}
