"use client"

/**
 * Trace dialog host (F21 PR2). Sister to `EditorDialogHost`. Mounts
 * the `TraceSelectionController` (numerate vs lineart picker) and,
 * once a kind is chosen, the `GenericTraceController` configured
 * with the inherited Pixelate superpixel grid.
 */
import { TraceSelectionController } from "@/features/editor/components/TraceSelectionController"
import { GenericTraceController } from "@/features/editor/components/trace-forms/generic-trace-controller"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

export function EditorTraceDialogHost(props: {
  selectionOpen: boolean
  activeKind: RegisteredTraceId | null
  traceDialogSource: { sourceImageUrl: string; sourceImageWidth: number; sourceImageHeight: number } | null
  onCloseSelection: () => void
  onSelectKind: (kind: RegisteredTraceId) => void
  onCloseConfigure: () => void
  onSuccess: () => void
  onError: (error: Error) => void
  onApplyTrace: (args: { kind: RegisteredTraceId; params: Record<string, unknown> }) => Promise<void>
}) {
  const {
    selectionOpen,
    activeKind,
    traceDialogSource,
    onCloseSelection,
    onSelectKind,
    onCloseConfigure,
    onSuccess,
    onError,
    onApplyTrace,
  } = props

  return (
    <>
      <TraceSelectionController
        workingImageUrl={traceDialogSource?.sourceImageUrl ?? null}
        open={selectionOpen}
        onClose={onCloseSelection}
        onSelect={onSelectKind}
      />
      {traceDialogSource && activeKind ? (
        <GenericTraceController
          kind={activeKind}
          ctx={{
            imageWidth: traceDialogSource.sourceImageWidth,
            imageHeight: traceDialogSource.sourceImageHeight,
          }}
          open
          onClose={onCloseConfigure}
          onSuccess={onSuccess}
          onError={onError}
          onApplyTrace={onApplyTrace}
        />
      ) : null}
    </>
  )
}
