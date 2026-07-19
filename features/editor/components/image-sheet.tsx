"use client"

/**
 * Editor Image dialog — the merged Image + Artboard sheet.
 *
 * Standard editor-sheet chrome: `sheetRootClass()` (full-screen overlay on
 * every breakpoint) + `SheetHeader` (title + Confirm/Close), matching the
 * Grid / Trace / Filter / Colors sheets. Tone-aware (dark/light) by scoping the app theme to
 * the editor's `EditorToolbarTone`: when the tone is dark we add the `dark`
 * class so the panel **and** the form-controls inside follow the dark theme.
 *
 * With an image present the body stacks, top to bottom: `ImagePanel`
 * (size/position/align + restore/fit), then the artboard/page controls —
 * `ArtboardPanel` (canvas size), `PaddingSection`, `PageBackgroundSection`.
 * Image settings sit on top.
 *
 * Progressive disclosure:
 * - No master image yet: an add-row (`AddImageMenuAction` upload pipeline).
 *   The artboard controls only surface alongside an image (the dialog is
 *   reached via the top bar's pencil, which only exists once an image is set).
 * - Image exists: the stacked panels above. Deleting the image lives on the
 *   top-right image bar (Trash2), not in this sheet.
 */
import dynamic from "next/dynamic"
import { ImageIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"
import type { Unit } from "@/lib/editor/units"

import { AddImageMenuAction } from "./add-image-menu-button"
import { useEditorToolbarTone } from "./editor-toolbar-tone"
import type { ProjectCanvasStageHandle } from "./project-canvas-stage"
import { SheetAddRow, SheetHeader } from "./sheet-chrome"
import { sheetRootClass } from "./sheet-shell"

// All panels are code-split via next/dynamic so the merged sheet's body stays
// out of the eager editor bundle (keeps the bundle-size budget — same pattern
// as ImagePanel, matching how ArtboardSheet's panels loaded before the merge).
const ImagePanel = dynamic(() => import("./image-panel").then((m) => m.ImagePanel), {
  ssr: false,
  loading: () => null,
})
const ArtboardPanel = dynamic(() => import("./artboard-panel").then((m) => m.ArtboardPanel), {
  ssr: false,
  loading: () => null,
})
const PaddingSection = dynamic(() => import("./padding-section").then((m) => m.PaddingSection), {
  ssr: false,
  loading: () => null,
})
const PageBackgroundSection = dynamic(
  () => import("./page-background-section").then((m) => m.PageBackgroundSection),
  { ssr: false, loading: () => null },
)

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
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    onPageBgEnabledChange,
    onPageBgColorChange,
    onPageBgOpacityChange,
  } = props

  const tone = useEditorToolbarTone()

  return (
    <section
      aria-label="Image"
      className={cn(
        // Scope the dark theme to the editor tone (panel + inputs follow it).
        tone === "dark" && "dark",
        "text-foreground",
        // Standard editor-sheet chrome: full width / full height on every
        // breakpoint (matches Grid / Trace / Filter / Colors — no card).
        sheetRootClass(),
      )}
    >
      <SheetHeader title="Image" onClose={onClose} onConfirm={onClose} />

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
    </section>
  )
}
