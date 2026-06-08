"use client"

/**
 * Trace dialog host. Sister to `EditorDialogHost`. Mounts the
 * `TraceSelectionController` (trace picker) and, once a kind is chosen, the
 * appropriate configure surface:
 *   - pixelate         → `PixelateDialog`
 *   - circulate        → `CirculateDialog`
 *   - lineart (mobile) → `LineArtDialog` (preview-pane shell)
 *   - lineart (≥768px) → `GenericTraceController` (legacy single-form)
 *   - other kinds      → `GenericTraceController`
 */
import { TraceSelectionController } from "@/features/editor/components/TraceSelectionController"
import { CirculateDialog } from "@/features/editor/components/trace-forms/circulate-dialog"
import { GenericTraceController } from "@/features/editor/components/trace-forms/generic-trace-controller"
import { LineArtDialog } from "@/features/editor/components/trace-forms/lineart-dialog"
import { PixelateDialog } from "@/features/editor/components/trace-forms/pixelate-dialog"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import { useIsMobile } from "@/lib/ui/use-mobile"

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
  const isMobile = useIsMobile()

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
      {configureOpen && traceDialogSource && activeKind === "circulate" ? (
        <CirculateDialog
          open
          sourceImageUrl={traceDialogSource.sourceImageUrl}
          displayMmW={traceDialogSource.displayMmW}
          displayMmH={traceDialogSource.displayMmH}
          onClose={onCloseConfigure}
          onSuccess={onApplied}
          onApplyTrace={onApplyTrace}
        />
      ) : null}
      {configureOpen && traceDialogSource && activeKind === "lineart" && isMobile ? (
        <LineArtDialog
          open
          sourceImageUrl={traceDialogSource.sourceImageUrl}
          displayMmW={traceDialogSource.displayMmW}
          displayMmH={traceDialogSource.displayMmH}
          onClose={onCloseConfigure}
          onSuccess={onApplied}
          onApplyTrace={onApplyTrace}
        />
      ) : null}
      {configureOpen
      && traceDialogSource
      && activeKind
      && activeKind !== "pixelate"
      && activeKind !== "circulate"
      && !(activeKind === "lineart" && isMobile) ? (
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
