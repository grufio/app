"use client"

/**
 * Mobile full-screen Artboard sheet.
 *
 * Surfaces every artboard-related control that lives on desktop in the
 * right panel (Page-Background, ArtboardPanel, GridPanel, ImagePanel)
 * inside a single scrollable mobile screen. Opens via the Artboard
 * icon in the editor's bottom-nav.
 *
 * Progressive disclosure (mirroring desktop):
 * - Page-Background + ArtboardPanel: always visible (artboard
 *   properties, never absent).
 * - Image-Section: an Upload-Image button when no master image
 *   exists, swaps to `ImagePanel` once uploaded. Delete in the
 *   ImagePanel reverts to the upload button.
 * - Grid-Section: an Add-Grid button when no grid exists, swaps to
 *   `GridPanel` once created. Delete-grid reverts back.
 *
 * Render shape: an `absolute inset-0` overlay inside the editor
 * layout container. The layout's parent has `position: relative` so
 * the sheet is bounded to the editor area; the bottom nav sits as a
 * flex-sibling below the layout in the shell root, untouched by this
 * overlay. Right panel + its restore/delete Radix dialogs stay
 * mounted (portaled) underneath, so actions from inside the sheet
 * still open the existing dialogs cleanly.
 */
import { useCallback, useState } from "react"
import dynamic from "next/dynamic"
import { Loader2, Plus, X } from "lucide-react"
import { useDropzone } from "react-dropzone"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { formatOperationErrorForToast, normalizeApiError } from "@/lib/api/error-normalizer"
import { uploadMasterImageClient, type UploadedMasterSnapshot } from "@/lib/editor/upload-master-image"

import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
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

/**
 * Mobile-shaped upload control. Same upload pipeline as
 * `AddImageMenuAction` (dropzone + `uploadMasterImageClient` + toast),
 * but rendered as a full-width shadcn `<Button>` instead of a
 * sidebar-anchored icon action.
 */
function MobileAddImageButton(props: {
  projectId: string
  onUploaded: (master: UploadedMasterSnapshot | null) => void | Promise<void>
}) {
  const { projectId, onUploaded } = props
  const [isUploading, setIsUploading] = useState(false)
  const uploadFile = useCallback(
    async (file: File) => {
      if (isUploading) return
      setIsUploading(true)
      try {
        const out = await uploadMasterImageClient({ projectId, file })
        if (!out.ok) {
          const formatted = formatOperationErrorForToast(normalizeApiError(out.error))
          toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
          return
        }
        await onUploaded(out.master)
      } catch (error) {
        const formatted = formatOperationErrorForToast(normalizeApiError(error))
        toast.error(formatted.title, formatted.detail ? { description: formatted.detail } : undefined)
      } finally {
        setIsUploading(false)
      }
    },
    [isUploading, onUploaded, projectId],
  )
  const onDrop = useCallback(
    (accepted: File[]) => {
      const f = accepted[0]
      if (!f) return
      void uploadFile(f)
    },
    [uploadFile],
  )
  const { getInputProps, open } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    maxFiles: 1,
    disabled: isUploading,
    noClick: true,
    noKeyboard: true,
  })
  return (
    <>
      <input data-testid="mobile-add-image-input" {...getInputProps()} />
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={open}
        disabled={isUploading}
        aria-busy={isUploading}
      >
        {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {isUploading ? "Uploading…" : "Upload image"}
      </Button>
    </>
  )
}

export function MobileArtboardSheet(props: {
  projectId: string
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
  onFitArtboardToImage?: () => void | Promise<void>
  // Grid: hasGrid drives the swap between Add-Button and GridPanel
  hasGrid: boolean
  gridVisible: boolean
  onGridVisibleChange: (v: boolean) => void
  onGridCreateRequested: () => void | Promise<void>
  // Image: hasMasterImage drives the swap between Upload-Button and ImagePanel
  hasMasterImage: boolean
  onImageUploaded: (master: UploadedMasterSnapshot | null) => void | Promise<void>
  panelImageTxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  workspaceUnit: Unit
  imagePanelReady: boolean
  imagePanelEnabled: boolean
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
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    onPageBgEnabledChange,
    onPageBgColorChange,
    onPageBgOpacityChange,
    canFit,
    onFitToArtboard,
    onFitArtboardToImage,
    hasGrid,
    gridVisible,
    onGridVisibleChange,
    onGridCreateRequested,
    hasMasterImage,
    onImageUploaded,
    panelImageTxU,
    workspaceUnit,
    imagePanelReady,
    imagePanelEnabled,
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
        {hasGrid ? (
          <GridPanel gridVisible={gridVisible} onGridVisibleChange={onGridVisibleChange} />
        ) : (
          <EditorSidebarSection title="Grid">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => void onGridCreateRequested()}
            >
              <Plus className="size-4" />
              Add grid
            </Button>
          </EditorSidebarSection>
        )}
        {hasMasterImage ? (
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
            canRestore={!masterImageLoading && !deleteBusy && !restoreBusy}
            canFit={canFit}
            canDelete={!masterImageLoading && !deleteBusy}
            onFitToArtboard={onFitToArtboard}
            onRestore={onRequestRestore}
            onDelete={onRequestDelete}
          />
        ) : (
          <EditorSidebarSection title="Image">
            <MobileAddImageButton projectId={projectId} onUploaded={onImageUploaded} />
          </EditorSidebarSection>
        )}
      </div>
    </section>
  )
}
