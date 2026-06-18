"use client"

/**
 * Editor Image dialog — Feather-3D style.
 *
 * Responsive: full-screen overlay on mobile, a centred rounded panel on
 * desktop (`md:`). Tone-aware (dark/light) by scoping the app theme to the
 * editor's `EditorToolbarTone`: when the tone is dark we add the `dark` class
 * so the panel **and** the form-controls inside follow the dark theme — no
 * per-control restyle. No section titles; a footer hosts the round Apply +
 * Delete actions.
 *
 * Progressive disclosure:
 * - No master image yet: an add-row (`AddImageMenuAction` upload pipeline).
 * - Image exists: `ImagePanel` (size/position/align + restore/fit), with the
 *   footer Apply (close) and Delete (remove image via the cascade confirm).
 */
import dynamic from "next/dynamic"
import { Check, ImageIcon, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"
import type { Unit } from "@/lib/editor/units"

import { AddImageMenuAction } from "./add-image-menu-button"
import { useEditorToolbarTone } from "./editor-toolbar-tone"
import type { ProjectCanvasStageHandle } from "./project-canvas-stage"
import { SheetAddRow } from "./sheet-chrome"

const ImagePanel = dynamic(() => import("./image-panel").then((m) => m.ImagePanel), {
  ssr: false,
  loading: () => null,
})

export function ImageSheet(props: {
  projectId: string
  onClose: () => void
  /** hasMasterImage drives the swap between the Add-row and ImagePanel. */
  hasMasterImage: boolean
  onImageUploaded: (master: UploadedMasterSnapshot | null) => void | Promise<void>
  panelImageTxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  workspaceUnit: Unit
  imagePanelReady: boolean
  imagePanelEnabled: boolean
  /** True when a filter/trace depends on the image → image functions disabled
   * (passed straight through to the inner `ImagePanel`). */
  imageLocked?: boolean
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
    hasMasterImage,
    onImageUploaded,
    panelImageTxU,
    workspaceUnit,
    imagePanelReady,
    imagePanelEnabled,
    imageLocked,
    canFit,
    onFitToArtboard,
    masterImageLoading,
    deleteBusy,
    restoreBusy,
    canvasRef,
    onRequestRestore,
    onRequestDelete,
  } = props

  const tone = useEditorToolbarTone()
  const canDelete = !masterImageLoading && !deleteBusy && !imageLocked

  return (
    <section
      aria-label="Image"
      className={cn(
        // Scope the dark theme to the editor tone (panel + inputs follow it).
        tone === "dark" && "dark",
        "text-foreground absolute inset-0 z-30 flex flex-col overflow-hidden bg-background",
        // Desktop: centred, rounded, bounded panel.
        "md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[80vh] md:w-80 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:shadow-xl",
      )}
    >
      <header className="flex shrink-0 items-center justify-end px-2 py-2">
        <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

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
            locked={imageLocked}
            onCommit={(w, h) => canvasRef.current?.setImageSize(w, h)}
            onCommitPosition={(opts) => canvasRef.current?.setImagePosition(opts)}
            onAlign={(opts) => canvasRef.current?.alignImage(opts)}
            canRestore={!masterImageLoading && !deleteBusy && !restoreBusy}
            canFit={canFit}
            onFitToArtboard={onFitToArtboard}
            onRestore={onRequestRestore}
          />
        ) : (
          <SheetAddRow Icon={ImageIcon} label="Image">
            <AddImageMenuAction projectId={projectId} onUploaded={onImageUploaded} />
          </SheetAddRow>
        )}
      </div>

      {hasMasterImage ? (
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t px-3 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete image"
            className="text-destructive hover:text-destructive rounded-full"
            disabled={!canDelete}
            onClick={onRequestDelete}
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </Button>
          <Button
            type="button"
            size="icon"
            aria-label="Apply"
            className="rounded-full"
            onClick={onClose}
          >
            <Check aria-hidden="true" className="size-5" />
          </Button>
        </footer>
      ) : null}
    </section>
  )
}
