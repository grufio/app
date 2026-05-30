"use client"

/**
 * Mobile full-screen Artboard sheet.
 *
 * Surfaces every artboard-related control that lives on desktop in the
 * right panel (Page-Background, ArtboardPanel, GridPanel, ImagePanel)
 * inside a single scrollable mobile screen. Opens via the Artboard
 * icon in the editor's bottom-nav.
 *
 * Render shape: an `absolute inset-0` overlay inside the editor
 * layout container. The layout's parent has `position: relative` so
 * the sheet is bounded to the editor area; the bottom nav sits as a
 * flex-sibling below the layout in the shell root, untouched by this
 * overlay. Right panel + its restore/delete Radix dialogs stay
 * mounted (portaled) underneath, so actions from inside the sheet
 * still open the existing dialogs cleanly.
 *
 * Modal/restore dialogs continue to live in `ProjectEditorRightPanel`
 * (always mounted, Radix Portal'd) — the sheet just calls the same
 * handlers and the existing dialogs surface as portals.
 */
import dynamic from "next/dynamic"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"

import { PageBackgroundSection } from "./page-background-section"
import type { ProjectCanvasStageHandle } from "./project-canvas-stage"
import type { Unit } from "@/lib/editor/units"

// Mirror the right panel's code-splitting so the bundle cost is paid
// once, not twice. The dynamic chunks are shared with the desktop
// right panel when both code paths eventually render.
const ArtboardPanel = dynamic(() => import("./artboard-panel").then((m) => m.ArtboardPanel), {
  ssr: false,
  loading: () => null,
})
const GridPanel = dynamic(() => import("./grid-panel").then((m) => m.GridPanel), {
  ssr: false,
  loading: () => null,
})
const ImagePanel = dynamic(() => import("./image-panel").then((m) => m.ImagePanel), {
  ssr: false,
  loading: () => null,
})

export function MobileArtboardSheet(props: {
  onClose: () => void
  // Page-Background controls
  pageBgEnabled: boolean
  pageBgColor: string
  pageBgOpacity: number
  onPageBgEnabledChange: (v: boolean) => void
  onPageBgColorChange: (v: string) => void
  onPageBgOpacityChange: (v: number) => void
  // ArtboardPanel
  canFit: boolean
  onFitToArtboard: () => void
  /** Optional — shrinks artboard to image bbox. The desktop right
   * panel wires this through `useProjectWorkspace().updateWorkspaceGeometry`;
   * mobile can omit it for now and the button stays disabled. */
  onFitArtboardToImage?: () => void | Promise<void>
  // GridPanel
  gridVisible: boolean
  onGridVisibleChange: (v: boolean) => void
  // ImagePanel
  panelImageTxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  workspaceUnit: Unit
  imagePanelReady: boolean
  imagePanelEnabled: boolean
  hasMasterImage: boolean
  masterImageLoading: boolean
  deleteBusy: boolean
  restoreBusy: boolean
  canvasRef: React.RefObject<ProjectCanvasStageHandle | null>
  onRequestRestore: () => void
  onRequestDelete: () => void
}) {
  const {
    onClose,
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    onPageBgEnabledChange,
    onPageBgColorChange,
    onPageBgOpacityChange,
    canFit,
    onFitToArtboard,
    onFitArtboardToImage,
    gridVisible,
    onGridVisibleChange,
    panelImageTxU,
    workspaceUnit,
    imagePanelReady,
    imagePanelEnabled,
    hasMasterImage,
    masterImageLoading,
    deleteBusy,
    restoreBusy,
    canvasRef,
    onRequestRestore,
    onRequestDelete,
  } = props

  return (
    <section
      aria-label="Artboard"
      className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-background md:hidden"
    >
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
        <h2 className="text-sm font-semibold">Artboard</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <PageBackgroundSection
          pageBgEnabled={pageBgEnabled}
          pageBgColor={pageBgColor}
          pageBgOpacity={pageBgOpacity}
          onPageBgEnabledChange={onPageBgEnabledChange}
          onPageBgColorChange={onPageBgColorChange}
          onPageBgOpacityChange={onPageBgOpacityChange}
        />
        <ArtboardPanel canFitToImage={canFit} onFitToImage={onFitArtboardToImage} />
        <GridPanel gridVisible={gridVisible} onGridVisibleChange={onGridVisibleChange} />
        <ImagePanel
          widthPxU={panelImageTxU?.w}
          heightPxU={panelImageTxU?.h}
          xPxU={panelImageTxU?.x}
          yPxU={panelImageTxU?.y}
          unit={workspaceUnit}
          ready={imagePanelReady}
          disabled={!imagePanelEnabled}
          onCommit={(w, h) => canvasRef.current?.setImageSize(w, h)}
          onCommitPosition={(opts) => canvasRef.current?.setImagePosition(opts)}
          onAlign={(opts) => canvasRef.current?.alignImage(opts)}
          canRestore={hasMasterImage && !masterImageLoading && !deleteBusy && !restoreBusy}
          canFit={canFit}
          canDelete={hasMasterImage && !masterImageLoading && !deleteBusy}
          onFitToArtboard={onFitToArtboard}
          onRestore={onRequestRestore}
          onDelete={onRequestDelete}
        />
      </div>
    </section>
  )
}
