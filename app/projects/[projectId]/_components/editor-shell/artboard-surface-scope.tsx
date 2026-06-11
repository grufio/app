"use client"

/**
 * Mobile-only scope for the artboard surface. Owns its `activeDialog`
 * state and renders one of the three standalone artboard dialogs
 * (`MobileArtboardSheet` / `MobileGridSheet` / `MobileImageSheet`). The
 * artboard surface has no dialog session (no `useFilterDialogSession` /
 * `useTraceDialogSession` analogue) — this scope exists to give
 * artboard the same lifecycle-is-dismissal property as the other
 * surfaces: switching to filter or trace unmounts the scope, killing
 * `activeDialog` so a re-visit doesn't pop a sheet back open.
 *
 * A dialog is opened from the top-left artboard "+" menu via the
 * `pendingDialog` cross-mount channel (the frame you tap — Artboard/Page,
 * Grid, or Image — selects which sheet renders).
 *
 * Mounted on `mobileSection === "artboard"` for both viewports. The
 * `desktop` flag flips each sheet from the mobile fullscreen variant to
 * a bounded floating card on `md+`.
 */
import { useEffect, useState, type ComponentProps } from "react"

import { MobileArtboardSheet } from "@/features/editor/components/mobile-artboard-sheet"
import { MobileGridSheet } from "@/features/editor/components/mobile-grid-sheet"
import { MobileImageSheet } from "@/features/editor/components/mobile-image-sheet"
import type { ArtboardDialog } from "@/lib/editor/mobile-sections"

type ArtboardSheetProps = Omit<ComponentProps<typeof MobileArtboardSheet>, "onClose" | "desktop">
type GridSheetProps = Omit<ComponentProps<typeof MobileGridSheet>, "onClose" | "desktop">
type ImageSheetProps = Omit<ComponentProps<typeof MobileImageSheet>, "onClose" | "desktop">

export type ArtboardSurfaceScopeProps = ArtboardSheetProps &
  GridSheetProps &
  ImageSheetProps & {
    /** When true, render the desktop variant (bounded card, no
     * `md:hidden`). Default false → unchanged mobile fullscreen. */
    desktop?: boolean
    /** Cross-mount request from the top-left artboard "+" menu naming which
     * dialog to open. Consumed immediately so `activeDialog` stays local
     * (revisiting the section doesn't re-pop a sheet). */
    pendingDialog?: ArtboardDialog | null
    onConsumePendingDialog?: () => void
  }

export function ArtboardSurfaceScope({
  desktop,
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

  switch (activeDialog) {
    case "artboard":
      return (
        <MobileArtboardSheet
          desktop={desktop}
          onClose={close}
          canFit={props.canFit}
          onFitArtboardToImage={props.onFitArtboardToImage}
          pageBgEnabled={props.pageBgEnabled}
          pageBgColor={props.pageBgColor}
          pageBgOpacity={props.pageBgOpacity}
          onPageBgEnabledChange={props.onPageBgEnabledChange}
          onPageBgColorChange={props.onPageBgColorChange}
          onPageBgOpacityChange={props.onPageBgOpacityChange}
        />
      )
    case "grid":
      return (
        <MobileGridSheet
          desktop={desktop}
          onClose={close}
          hasGrid={props.hasGrid}
          gridVisible={props.gridVisible}
          onGridVisibleChange={props.onGridVisibleChange}
          onGridCreateRequested={props.onGridCreateRequested}
          onGridDeleteRequested={props.onGridDeleteRequested}
        />
      )
    case "image":
      return (
        <MobileImageSheet
          desktop={desktop}
          onClose={close}
          projectId={props.projectId}
          hasMasterImage={props.hasMasterImage}
          onImageUploaded={props.onImageUploaded}
          panelImageTxU={props.panelImageTxU}
          workspaceUnit={props.workspaceUnit}
          imagePanelReady={props.imagePanelReady}
          imagePanelEnabled={props.imagePanelEnabled}
          imageLock={props.imageLock}
          canFit={props.canFit}
          onFitToArtboard={props.onFitToArtboard}
          masterImageLoading={props.masterImageLoading}
          deleteBusy={props.deleteBusy}
          restoreBusy={props.restoreBusy}
          canvasRef={props.canvasRef}
          onRequestRestore={props.onRequestRestore}
          onRequestDelete={props.onRequestDelete}
        />
      )
    default:
      return null
  }
}
