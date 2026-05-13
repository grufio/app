"use client"

/**
 * Trace dialog host (F21 PR2). Sister to `EditorDialogHost`. Mounts
 * the `TraceSelectionController` (numerate vs lineart picker) and,
 * once a kind is chosen, the appropriate configure surface:
 *   - numerate → 3-step `NumerateWizard` (Grid / Colors / Output)
 *   - lineart  → single-form `GenericTraceController`
 */
import { TraceSelectionController } from "@/features/editor/components/TraceSelectionController"
import { GenericTraceController } from "@/features/editor/components/trace-forms/generic-trace-controller"
import { NumerateWizard } from "@/features/editor/components/trace-forms/numerate-wizard"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export function EditorTraceDialogHost(props: {
  selectionOpen: boolean
  activeKind: RegisteredTraceId | null
  traceDialogSource: { sourceImageUrl: string; sourceImageWidth: number; sourceImageHeight: number } | null
  onCloseSelection: () => void
  onSelectKind: (kind: RegisteredTraceId) => void
  onCloseConfigure: () => void
  /** Called after a successful trace apply (e.g. to reset the dialog
   * session). The shell wires `traceDialog.reset` here. */
  onApplied: () => void
  onApplyTrace: (args: { kind: RegisteredTraceId; params: Record<string, unknown> }) => Promise<void>
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
  const onError = (error: Error) => {
    console.error("Failed to apply trace:", error)
  }

  return (
    <>
      <TraceSelectionController
        workingImageUrl={traceDialogSource?.sourceImageUrl ?? null}
        open={selectionOpen}
        onClose={onCloseSelection}
        onSelect={onSelectKind}
      />
      {configureOpen && traceDialogSource && activeKind === "numerate" ? (
        <NumerateWizard
          open
          imageWidth={traceDialogSource.sourceImageWidth}
          imageHeight={traceDialogSource.sourceImageHeight}
          onClose={onCloseConfigure}
          onSuccess={onApplied}
          onError={onError}
          onApplyTrace={onApplyTrace}
        />
      ) : null}
      {configureOpen && traceDialogSource && activeKind && activeKind !== "numerate" ? (
        <GenericTraceController
          kind={activeKind}
          ctx={{
            imageWidth: traceDialogSource.sourceImageWidth,
            imageHeight: traceDialogSource.sourceImageHeight,
          }}
          open
          onClose={onCloseConfigure}
          onSuccess={onApplied}
          onError={onError}
          onApplyTrace={onApplyTrace}
        />
      ) : null}
    </>
  )
}
