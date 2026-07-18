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
 * This is the merged Image + Artboard dialog (the former standalone
 * `ArtboardSheet` was folded in). With an image present it stacks, top to
 * bottom: `ImagePanel` (size/position/align + restore/fit), then the
 * artboard/page controls — `ArtboardPanel` (canvas size), `PaddingSection`,
 * `PageBackgroundSection`. Image settings sit on top.
 *
 * Progressive disclosure:
 * - No master image yet: an add-row (`AddImageMenuAction` upload pipeline).
 *   The artboard controls only surface alongside an image (the dialog is
 *   reached via the top bar's pencil, which only exists once an image is set).
 * - Image exists: the stacked panels above, with the footer Apply (close) and
 *   Delete (remove image via the cascade confirm).
 */
import dynamic from "next/dynamic"
import { Check, ImageIcon, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"
import type { Unit } from "@/lib/editor/units"

import { AddImageMenuAction } from "./add-image-menu-button"
import { ArtboardPanel } from "./artboard-panel"
import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { PaddingSection } from "./padding-section"
import { PageBackgroundSection } from "./page-background-section"
import type { ProjectCanvasStageHandle } from "./project-canvas-stage"
import { SheetAddRow } from "./sheet-chrome"

const ImagePanel = dynamic(() => import("./image-panel").then((m) => m.ImagePanel), {
  ssr: false,
  loading: () => null,
})

export function ImageSheet(props: {
  projectId: string
  onClose: () => void
  /** hasMasterImage drives the swap between the Add-row and the stacked panels. */
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
  // Page-background controls (folded in from the former ArtboardSheet).
  pageBgEnabled: boolean
  pageBgColor: string
  pageBgOpacity: number
  onPageBgEnabledChange: (v: boolean) => void
  onPageBgColorChange: (v: string) => void
  onPageBgOpacityChange: (v: number) => void
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
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    onPageBgEnabledChange,
    onPageBgColorChange,
    onPageBgOpacityChange,
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
          <>
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
            {/* Artboard / page settings, folded in below the image controls.
                ArtboardPanel + PaddingSection are self-contained (they read the
                workspace providers directly). The "Fit artboard to image" header
                action is intentionally omitted here — no handler is wired. */}
            <ArtboardPanel />
            <PaddingSection />
            <PageBackgroundSection
              pageBgEnabled={pageBgEnabled}
              pageBgColor={pageBgColor}
              pageBgOpacity={pageBgOpacity}
              onPageBgEnabledChange={onPageBgEnabledChange}
              onPageBgColorChange={onPageBgColorChange}
              onPageBgOpacityChange={onPageBgOpacityChange}
            />
          </>
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
