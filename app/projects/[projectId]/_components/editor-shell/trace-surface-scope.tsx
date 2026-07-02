"use client"

/**
 * Surface scope for the trace surface. Owns `useTraceDialogSession`,
 * the live mid-resize derivation of `traceDialogSource`, the
 * trace-section leave-guard, and the sheet `editOpen` state. Renders
 * `EditorTraceDialogHost` + the trace sheet (same chrome on both
 * viewports; `desktop` flips fullscreen → bounded card). The top-right
 * bar (theme toggle + the trace Eye view-options) is mounted by the
 * shell so it's available on every section.
 *
 * Lifecycle IS dismissal: the shell mounts this scope only while the
 * trace surface is active (`editorSection === "trace"`); switching
 * surfaces unmounts it, so the dialog/sheet state dies without an
 * effect-based reset.
 */
import { useCallback, useEffect, useMemo, useState } from "react"

import { TraceSheet } from "@/features/editor/components/trace-sheet"
import type { TraceDialogSourceImage, TraceKind } from "@/lib/editor/hooks/use-trace-dialog-session"
import { useTraceDialogSession } from "@/lib/editor/hooks/use-trace-dialog-session"
import { useMutationLeaveGuard } from "@/lib/editor/hooks/use-mutation-leave-guard"

import { EditorTraceDialogHost } from "./editor-trace-dialog-host"

export type TraceSurfaceScopeProps = {
  traceSourceImage: TraceDialogSourceImage | null
  onApplyTrace: (args: { kind: TraceKind; params: Record<string, unknown> }) => Promise<void>
  isAddTraceDisabled: boolean
  isClearingTrace: boolean
  isLoadingInitial: boolean
  trace: { kind: TraceKind; params: Record<string, unknown> } | null
  onClearTrace: () => void | Promise<void>
  /** Cross-mount channel from `EditorFuncsBar`: when a trace kind
   * has been requested from outside this scope, open the matching
   * configure dialog directly (skip the picker) and signal consume. */
  pendingKindOpen?: TraceKind | null
  onConsumePendingKindOpen?: () => void
  /** Cross-mount channel from the trace top-right bar's "+": open the kind
   * PICKER (selection). Distinct from `pendingKindOpen`, which skips it. */
  pendingSelectionOpen?: boolean
  onConsumePendingSelectionOpen?: () => void
  /** Fired when the user cancels the configure dialog (X / Cancel /
   * Escape / overlay click) — distinct from a successful Apply, which
   * unmounts via `reset` and never reaches the cancel handler. The
   * shell wires this to restore the mobile section to "artboard". */
  onConfigureCancelled?: () => void
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

  const { pendingSelectionOpen, onConsumePendingSelectionOpen } = props
  const { beginSelection: beginTraceSelection } = traceDialog
  useEffect(() => {
    if (!pendingSelectionOpen) return
    beginTraceSelection()
    onConsumePendingSelectionOpen?.()
  }, [pendingSelectionOpen, beginTraceSelection, onConsumePendingSelectionOpen])

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
      {/* The top-right bar (theme toggle + the Eye view-options for trace)
          is mounted by the shell now, so it shows on every section. */}
      {editOpen ? (
        <TraceSheet
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
