"use client"

/**
 * Mobile-only scope for the image surface. Owns its `activeDialog` state
 * and renders the merged Image dialog (`ImageSheet`, which now also carries
 * the artboard/page settings). The surface has no dialog session (no
 * `useFilterDialogSession` / `useTraceDialogSession` analogue) — this scope
 * exists to give the image surface the same lifecycle-is-dismissal property
 * as the other surfaces: switching to filter or trace unmounts the scope,
 * killing `activeDialog` so a re-visit doesn't pop a sheet back open.
 *
 * The dialog is opened from the top bar's pencil via the `pendingDialog`
 * cross-mount channel. The former standalone Artboard + Grid dialogs were
 * folded away: Artboard's settings live inside `ImageSheet` now, and Grid is
 * temporarily removed from the nav (its `GridSheet`/`grid-panel` code stays,
 * and the grid props are still threaded here, but no entry point opens it).
 *
 * Mounted on `editorSection === "image"` for both viewports — the sheet
 * renders as a fullscreen overlay (desktop matches mobile).
 */
import { useEffect, useState, type ComponentProps } from "react"

import { GridSheet } from "@/features/editor/components/grid-sheet"
import { ImageSheet } from "@/features/editor/components/image-sheet"
import type { ArtboardDialog } from "@/lib/editor/editor-sections"

// GridSheet is no longer rendered (grid is out of the nav for now) but the
// shell still threads its props through — keep the prop type so the mount
// site stays unchanged and the grid plumbing survives for an easy re-enable.
type GridSheetProps = Omit<ComponentProps<typeof GridSheet>, "onClose">
type ImageSheetProps = Omit<ComponentProps<typeof ImageSheet>, "onClose">

export type ArtboardSurfaceScopeProps = GridSheetProps &
  ImageSheetProps & {
    /** Cross-mount request from the top bar's pencil naming which dialog to
     * open. Consumed immediately so `activeDialog` stays local (revisiting the
     * section doesn't re-pop a sheet). */
    pendingDialog?: ArtboardDialog | null
    onConsumePendingDialog?: () => void
  }

export function ArtboardSurfaceScope({
  pendingDialog = null,
  onConsumePendingDialog,
  ...props
}: ArtboardSurfaceScopeProps) {
  const [activeDialog, setActiveDialog] = useState<ArtboardDialog | null>(null)

  useEffect(() => {
    if (!pendingDialog) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveDialog(pendingDialog)
    onConsumePendingDialog?.()
  }, [pendingDialog, onConsumePendingDialog])

  const close = () => setActiveDialog(null)

  if (activeDialog !== "image") return null

  return (
    <ImageSheet
      onClose={close}
      projectId={props.projectId}
      hasMasterImage={props.hasMasterImage}
      onImageUploaded={props.onImageUploaded}
      panelImageTxU={props.panelImageTxU}
      workspaceUnit={props.workspaceUnit}
      imagePanelReady={props.imagePanelReady}
      imagePanelEnabled={props.imagePanelEnabled}
      imageLocked={props.imageLocked}
      canFit={props.canFit}
      onFitToArtboard={props.onFitToArtboard}
      masterImageLoading={props.masterImageLoading}
      deleteBusy={props.deleteBusy}
      restoreBusy={props.restoreBusy}
      canvasRef={props.canvasRef}
      onRequestRestore={props.onRequestRestore}
      onRequestDelete={props.onRequestDelete}
      pageBgEnabled={props.pageBgEnabled}
      pageBgColor={props.pageBgColor}
      pageBgOpacity={props.pageBgOpacity}
      onPageBgEnabledChange={props.onPageBgEnabledChange}
      onPageBgColorChange={props.onPageBgColorChange}
      onPageBgOpacityChange={props.onPageBgOpacityChange}
    />
  )
}
