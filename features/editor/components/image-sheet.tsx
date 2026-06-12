"use client"

/**
 * Editor Image sheet (full-screen on mobile, bounded card on desktop).
 *
 * One of the three standalone dialogs the artboard section's top-left
 * "+" menu opens (alongside `ArtboardSheet` + `GridSheet`).
 *
 * Progressive disclosure (mirroring desktop):
 * - No master image yet: a desktop-style nav-row (icon + label + `+`
 *   action) hosting the shared upload pipeline (`AddImageMenuAction`).
 * - Image exists: swaps to `ImagePanel` (size/position/align + fit,
 *   restore, delete). Delete reverts to the row.
 *
 * The Add-row reuses `AddImageMenuAction` + `SidebarMenuAction` —
 * shared sidebar primitives, same upload pipeline, no surface-specific
 * button variant. Render shape matches the other section sheets
 * (`sheetRootClass`); the shell-root Restore/Delete Radix dialogs
 * are portaled, so actions from inside the sheet open them cleanly.
 */
import dynamic from "next/dynamic"
import { ImageIcon } from "lucide-react"

import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"
import type { Unit } from "@/lib/editor/units"

import { AddImageMenuAction } from "./add-image-menu-button"
import { sheetRootClass } from "./sheet-shell"
import type { ProjectCanvasStageHandle } from "./project-canvas-stage"
import { SheetAddRow, SheetHeader } from "./sheet-chrome"

const ImagePanel = dynamic(() => import("./image-panel").then((m) => m.ImagePanel), {
  ssr: false,
  loading: () => null,
})

export function ImageSheet(props: {
  projectId: string
  onClose: () => void
  /** Desktop variant — bounded floating card instead of fullscreen. */
  desktop?: boolean
  /** hasMasterImage drives the swap between the Add-row and ImagePanel. */
  hasMasterImage: boolean
  onImageUploaded: (master: UploadedMasterSnapshot | null) => void | Promise<void>
  panelImageTxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  workspaceUnit: Unit
  imagePanelReady: boolean
  imagePanelEnabled: boolean
  /** Section-lock for the Image panel — passed straight through to the
   * inner `ImagePanel`. Null on desktop or when not locked. */
  imageLock?: {
    message: string
    toggleable: boolean
    busy?: boolean
    onUnlock?: () => void
  } | null
  canFit: boolean
  onFitToArtboard: () => void
  masterImageLoading: boolean
  deleteBusy: boolean
  restoreBusy: boolean
  canvasRef: React.RefObject<ProjectCanvasStageHandle | null>
  onRequestRestore: () => void
  onRequestDelete: () => void
}) {
  const {
    projectId,
    onClose,
    desktop,
    hasMasterImage,
    onImageUploaded,
    panelImageTxU,
    workspaceUnit,
    imagePanelReady,
    imagePanelEnabled,
    imageLock,
    canFit,
    onFitToArtboard,
    masterImageLoading,
    deleteBusy,
    restoreBusy,
    canvasRef,
    onRequestRestore,
    onRequestDelete,
  } = props

  return (
    <section aria-label="Image" className={sheetRootClass(desktop)}>
      <SheetHeader title="Image" onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        {hasMasterImage ? (
          <ImagePanel
            widthPxU={panelImageTxU?.w}
            heightPxU={panelImageTxU?.h}
            xPxU={panelImageTxU?.x}
            yPxU={panelImageTxU?.y}
            unit={workspaceUnit}
            ready={imagePanelReady}
            disabled={!imagePanelEnabled}
            lock={imageLock ?? null}
            onCommit={(w, h) => canvasRef.current?.setImageSize(w, h)}
            onCommitPosition={(opts) => canvasRef.current?.setImagePosition(opts)}
            onAlign={(opts) => canvasRef.current?.alignImage(opts)}
            canRestore={!masterImageLoading && !deleteBusy && !restoreBusy}
            canFit={canFit}
            canDelete={!masterImageLoading && !deleteBusy}
            onFitToArtboard={onFitToArtboard}
            onRestore={onRequestRestore}
            onDelete={onRequestDelete}
          />
        ) : (
          <SheetAddRow Icon={ImageIcon} label="Image">
            <AddImageMenuAction projectId={projectId} onUploaded={onImageUploaded} />
          </SheetAddRow>
        )}
      </div>
    </section>
  )
}
