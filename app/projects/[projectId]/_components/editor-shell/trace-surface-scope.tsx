"use client"

/**
 * Twin of `FilterSurfaceScope` for the trace surface. Owns
 * `useTraceDialogSession`, the live mid-resize derivation of
 * `traceDialogSource`, the trace-section leave-guard, and mobile
 * sheet `editOpen` state. Renders `EditorTraceDialogHost` plus the
 * sidebar section or the mobile button + sheet depending on
 * `intent`. See `filter-surface-scope.tsx` for the full architectural
 * rationale (lifecycle IS dismissal).
 */
import { useCallback, useMemo, useState } from "react"

import { MobileEditButton } from "@/features/editor/components/mobile-edit-button"
import { MobileTraceSheet } from "@/features/editor/components/mobile-trace-sheet"
import { MobileViewOptionsButton } from "@/features/editor/components/mobile-view-options-button"
import { TraceSidebarSection } from "@/features/editor/components/trace-sidebar-section"
import type { TraceDialogSourceImage, TraceKind } from "@/lib/editor/hooks/use-trace-dialog-session"
import { useTraceDialogSession } from "@/lib/editor/hooks/use-trace-dialog-session"
import { useMutationLeaveGuard } from "@/lib/editor/hooks/use-mutation-leave-guard"

import { EditorTraceDialogHost } from "./editor-trace-dialog-host"

export type TraceSurfaceScopeProps = {
  intent: "desktop" | "mobile"
  traceSourceImage: TraceDialogSourceImage | null
  onApplyTrace: (args: { kind: TraceKind; params: Record<string, unknown> }) => Promise<void>
  isAddTraceDisabled: boolean
  isClearingTrace: boolean
  isLoadingInitial: boolean
  trace: { kind: TraceKind } | null
  onClearTrace: () => void
  /** Mobile-only: closing the left-panel Sheet drawer before opening
   * the trace selection dialog. Desktop ignores this. */
  onBeforeOpenSelection?: () => void
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
    props.onBeforeOpenSelection?.()
    traceDialog.beginSelection()
  }, [props, traceDialog])

  const handleApplied = useCallback(() => {
    traceDialog.reset()
    setEditOpen(false)
  }, [traceDialog])

  return (
    <>
      <EditorTraceDialogHost
        selectionOpen={traceDialog.selectionOpen}
        activeKind={traceDialog.activeKind}
        traceDialogSource={liveTraceDialogSource}
        onCloseSelection={traceDialog.closeSelection}
        onSelectKind={traceDialog.selectKind}
        onCloseConfigure={traceDialog.closeConfigure}
        onApplied={handleApplied}
        onApplyTrace={props.onApplyTrace}
      />
      {props.intent === "desktop" ? (
        <TraceSidebarSection
          trace={props.trace}
          isAddTraceDisabled={props.isAddTraceDisabled}
          isClearingTrace={props.isClearingTrace}
          isLoadingInitial={props.isLoadingInitial}
          onClearTrace={props.onClearTrace}
          onOpenSelection={openSelection}
        />
      ) : (
        <>
          {props.trace !== null
          && (props.trace.kind === "pixelate" || props.trace.kind === "circulate") ? (
            <MobileViewOptionsButton
              traceOverlayVisible={props.traceOverlayVisible}
              previewBitmapVisible={props.previewBitmapVisible}
              numbersLayerVisible={props.numbersLayerVisible}
              onTraceOverlayChange={props.onTraceOverlayChange}
              onPreviewBitmapChange={props.onPreviewBitmapChange}
              onNumbersLayerChange={props.onNumbersLayerChange}
            />
          ) : null}
          <MobileEditButton onClick={() => setEditOpen(true)} ariaLabel="Edit trace" />
          {editOpen ? (
            <MobileTraceSheet
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
      )}
    </>
  )
}
