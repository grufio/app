"use client"

/**
 * Twin of `FilterSurfaceScope` for the trace surface. Owns
 * `useTraceDialogSession`, the live mid-resize derivation of
 * `traceDialogSource`, the trace-section leave-guard, and the sheet
 * `editOpen` state. Renders `EditorTraceDialogHost` plus the floating
 * Edit/Eye bar + the trace sheet (same chrome on both viewports;
 * `desktop` flips fullscreen → bounded card). See
 * `filter-surface-scope.tsx` for the full architectural rationale
 * (lifecycle IS dismissal).
 */
import { useCallback, useEffect, useMemo, useState } from "react"

import { MobileTopRightBar } from "@/features/editor/components/mobile-top-right-bar"
import { MobileTraceSheet } from "@/features/editor/components/mobile-trace-sheet"
import type { TraceDialogSourceImage, TraceKind } from "@/lib/editor/hooks/use-trace-dialog-session"
import { useTraceDialogSession } from "@/lib/editor/hooks/use-trace-dialog-session"
import { useMutationLeaveGuard } from "@/lib/editor/hooks/use-mutation-leave-guard"

import { EditorTraceDialogHost } from "./editor-trace-dialog-host"

export type TraceSurfaceScopeProps = {
  /** Legacy variant marker — retained as `"mobile"` only so existing
   * call sites stay explicit. Both viewports render the same chrome
   * now; styling is driven by `desktop`. */
  intent: "mobile"
  /** When true, the Edit/Eye bar + sheet render their desktop variant
   * (no `md:hidden`, bounded floating card). Default false → the
   * unchanged mobile fullscreen behaviour. */
  desktop?: boolean
  traceSourceImage: TraceDialogSourceImage | null
  onApplyTrace: (args: { kind: TraceKind; params: Record<string, unknown> }) => Promise<void>
  isAddTraceDisabled: boolean
  isClearingTrace: boolean
  isLoadingInitial: boolean
  trace: { kind: TraceKind; params: Record<string, unknown> } | null
  onClearTrace: () => void | Promise<void>
  /** Cross-mount channel from `EditorTopLeftBar`: when a trace kind
   * has been requested from outside this scope, open the matching
   * configure dialog directly (skip the picker) and signal consume. */
  pendingKindOpen?: TraceKind | null
  onConsumePendingKindOpen?: () => void
  /** Fired when the user cancels the configure dialog (X / Cancel /
   * Escape / overlay click) — distinct from a successful Apply, which
   * unmounts via `reset` and never reaches the cancel handler. The
   * shell wires this to restore the mobile section to "artboard". */
  onConfigureCancelled?: () => void
  // Mobile-only visibility toggles (rendered inside MobileTraceSheet).
  traceOverlayVisible: boolean
  previewBitmapVisible: boolean
  numbersLayerVisible: boolean
  onTraceOverlayChange: (v: boolean) => void
  onPreviewBitmapChange: (v: boolean) => void
  onNumbersLayerChange: (v: boolean) => void
}

export function TraceSurfaceScope(props: TraceSurfaceScopeProps) {
  const traceDialog = useTraceDialogSession(props.traceSourceImage)
  const [editOpen, setEditOpen] = useState(false)

  useMutationLeaveGuard({ active: traceDialog.activeKind !== null })

  const { pendingKindOpen, onConsumePendingKindOpen } = props
  const { openKind: openTraceKind } = traceDialog
  useEffect(() => {
    if (!pendingKindOpen) return
    openTraceKind(pendingKindOpen)
    onConsumePendingKindOpen?.()
  }, [pendingKindOpen, openTraceKind, onConsumePendingKindOpen])

  // Snapshot from `traceDialog.session` carries the stable identity
  // (sourceImageUrl + intrinsic px), but `displayMmW`/`displayMmH`
  // must reflect the *live* canvas mirror so a mid-dialog resize is
  // reflected in the dialog header and in the grid math. Override
  // only the live fields.
  const liveTraceDialogSource = useMemo(() => {
    if (!traceDialog.session) return null
    if (!props.traceSourceImage) return traceDialog.session
    return {
      ...traceDialog.session,
      displayMmW: props.traceSourceImage.displayMmW,
      displayMmH: props.traceSourceImage.displayMmH,
    }
  }, [traceDialog.session, props.traceSourceImage])

  const openSelection = useCallback(() => {
    if (props.isAddTraceDisabled) return
    traceDialog.beginSelection()
  }, [props, traceDialog])

  const handleApplied = useCallback(() => {
    traceDialog.reset()
    setEditOpen(false)
  }, [traceDialog])

  const { onConfigureCancelled } = props
  const handleCloseConfigure = useCallback(() => {
    traceDialog.closeConfigure()
    onConfigureCancelled?.()
  }, [traceDialog, onConfigureCancelled])

  // Delete from inside the active trace's configure dialog: clear the
  // trace and only THEN dismiss the dialog. Awaiting keeps the dialog
  // (and its delete spinner) up until the clear + image refresh finish,
  // so the surface doesn't switch back before the work is done.
  const { onClearTrace } = props
  const handleDeleteTrace = useCallback(async () => {
    await onClearTrace()
    handleCloseConfigure()
  }, [onClearTrace, handleCloseConfigure])

  return (
    <>
      <EditorTraceDialogHost
        selectionOpen={traceDialog.selectionOpen}
        activeKind={traceDialog.activeKind}
        traceDialogSource={liveTraceDialogSource}
        onCloseSelection={traceDialog.closeSelection}
        onSelectKind={traceDialog.selectKind}
        onCloseConfigure={handleCloseConfigure}
        onApplied={handleApplied}
        onApplyTrace={props.onApplyTrace}
        onDeleteTrace={props.trace !== null ? handleDeleteTrace : undefined}
        initialParams={props.trace?.params}
      />
      <MobileTopRightBar
        desktop={props.desktop}
        onEditTap={() => setEditOpen(true)}
        ariaLabelEdit="Edit trace"
        viewOptions={
          props.trace !== null
          && (props.trace.kind === "pixelate" || props.trace.kind === "circulate")
            ? {
                traceOverlayVisible: props.traceOverlayVisible,
                previewBitmapVisible: props.previewBitmapVisible,
                numbersLayerVisible: props.numbersLayerVisible,
                onTraceOverlayChange: props.onTraceOverlayChange,
                onPreviewBitmapChange: props.onPreviewBitmapChange,
                onNumbersLayerChange: props.onNumbersLayerChange,
              }
            : null
        }
      />
      {editOpen ? (
        <MobileTraceSheet
          desktop={props.desktop}
          onClose={() => setEditOpen(false)}
          trace={props.trace}
          isAddTraceDisabled={props.isAddTraceDisabled}
          isClearingTrace={props.isClearingTrace}
          isLoadingInitial={props.isLoadingInitial}
          onClearTrace={props.onClearTrace}
          onOpenSelection={openSelection}
        />
      ) : null}
    </>
  )
}
