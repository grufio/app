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

  // Solid (non-glass) tone chips for the dialog actions.
  const chipBase =
    "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
  const chipSolid =
    tone === "dark" ? "bg-zinc-800 text-white hover:bg-zinc-700" : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
  const chipApply =
    tone === "dark" ? "bg-white text-zinc-900 hover:bg-zinc-200" : "bg-zinc-900 text-white hover:bg-zinc-800"
  const chipDelete =
    tone === "dark" ? "bg-red-500/15 text-red-400 hover:bg-red-500/25" : "bg-red-500/10 text-red-600 hover:bg-red-500/20"

  return (
    <section
      aria-label="Image"
      className={cn(
        // Solid tone surface (no glass). `.dark` scopes the app dark theme to
        // the editor tone, so the inputs inside follow dark/light too.
        tone === "dark"
          ? "dark bg-zinc-900 text-white ring-1 ring-white/10"
          : "bg-white text-zinc-900 ring-1 ring-zinc-900/10",
        "absolute inset-0 z-30 flex flex-col overflow-hidden",
        // Desktop: centred, rounded, bounded panel.
        "md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[80vh] md:w-80 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:shadow-xl",
      )}
    >
      <header className="flex shrink-0 items-center justify-end px-2 py-2">
        <button type="button" aria-label="Close" onClick={onClose} className={cn(chipBase, chipSolid)}>
          <X aria-hidden="true" className="size-5" />
        </button>
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
          <button
            type="button"
            aria-label="Delete image"
            disabled={!canDelete}
            onClick={onRequestDelete}
            className={cn(chipBase, chipDelete)}
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Apply"
            onClick={onClose}
            className={cn(chipBase, chipApply)}
          >
            <Check aria-hidden="true" className="size-5" />
          </button>
        </footer>
      ) : null}
    </section>
  )
}
