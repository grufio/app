"use client"

import { useParams } from "next/navigation"
import { useCallback, useMemo, useRef, useState } from "react"
import { RotateCcw, Trash2 } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectImageUploader } from "@/components/app-img-upload"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArtboardPanel,
  CanvasToolSidebar,
  ImagePanel,
  ProjectCanvasStage,
  type ProjectCanvasStageHandle,
  ProjectEditorHeader,
} from "@/components/shared/editor"
import { EditorErrorBoundary } from "@/components/shared/editor/editor-error-boundary"
import { useMasterImage } from "@/lib/editor/use-master-image"
import { useProject } from "@/lib/editor/use-project"
import { useImageState } from "@/lib/editor/use-image-state"

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const [tab, setTab] = useState<"image" | "filter" | "convert" | "output">(
    "image"
  )
  const projectId = params.projectId
  const { project, setProject } = useProject(projectId)
  const {
    masterImage,
    masterImageLoading,
    masterImageError,
    refreshMasterImage,
    deleteBusy,
    deleteError,
    setDeleteError,
    deleteImage,
  } = useMasterImage(projectId)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [tool, setTool] = useState<"select" | "hand">("hand")
  const panEnabled = tool === "hand"
  const imageDraggable = tool === "select"
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const [artboardPx, setArtboardPx] = useState<{ w: number; h: number } | null>(null)
  const [imagePx, setImagePx] = useState<{ w: number; h: number } | null>(null)
  const { initialImageTransform, imageStateError, imageStateLoading, saveImageState } = useImageState(
    projectId,
    Boolean(masterImage)
  )
  const [artboardMeta, setArtboardMeta] = useState<{ unit: "mm" | "cm" | "pt" | "px"; dpi: number } | null>(null)

  const initialImagePx = useMemo(() => {
    if (!masterImage || !initialImageTransform) return null
    const w =
      Number.isFinite(Number(initialImageTransform.widthPx)) && Number(initialImageTransform.widthPx) > 0
        ? Number(initialImageTransform.widthPx)
        : masterImage.width_px * initialImageTransform.scaleX
    const h =
      Number.isFinite(Number(initialImageTransform.heightPx)) && Number(initialImageTransform.heightPx) > 0
        ? Number(initialImageTransform.heightPx)
        : masterImage.height_px * initialImageTransform.scaleY
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
    return { w, h }
  }, [initialImageTransform, masterImage])

  const handleArtboardPxChange = useCallback((w: number, h: number) => {
    setArtboardPx({ w, h })
  }, [])

  const handleImagePxChange = useCallback((w: number, h: number) => {
    setImagePx((prev) => {
      if (prev && prev.w === w && prev.h === h) return prev
      return { w, h }
    })
  }, [])

  const handleDeleteMasterImage = useCallback(async () => {
    const res = await deleteImage()
    if (!res.ok) return
    setDeleteOpen(false)
    setImagePx(null)
  }, [deleteImage])

  // Keep tool sidebar callbacks stable to avoid unnecessary rerenders.
  const handleZoomIn = useCallback(() => canvasRef.current?.zoomIn(), [])
  const handleZoomOut = useCallback(() => canvasRef.current?.zoomOut(), [])
  const handleFit = useCallback(() => canvasRef.current?.fitToView(), [])
  const handleRotate = useCallback(() => canvasRef.current?.rotate90(), [])

  return (
    <div className="flex min-h-svh w-full flex-col">
      <ProjectEditorHeader
        projectId={projectId}
        initialTitle={project?.id === projectId ? project.name : "Untitled"}
        onTitleUpdated={(nextTitle) => setProject({ id: projectId, name: nextTitle })}
      />

      {/* Tabs row */}
      <div className="bg-background px-4 pb-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="image">Image</TabsTrigger>
            <TabsTrigger value="filter">Filter</TabsTrigger>
            <TabsTrigger value="convert">Vectorize / Grid</TabsTrigger>
            <TabsTrigger value="output">PDF Output</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content row (starts under the same top divider line for both left + right sidebars) */}
      <div className="flex flex-1 border-t border-border bg-muted/50">
        {tab === "image" ? (
          <EditorErrorBoundary resetKey={`${projectId}:${masterImage?.signedUrl ?? "no-image"}`}>
            {/* Main content (left tools + canvas/uploader) */}
            <main className="flex min-w-0 flex-1">
              {/* Template-level left sidebar (Illustrator-style) */}
              <aside className="flex w-12 shrink-0 justify-center border-r bg-background/80 py-2">
                <CanvasToolSidebar
                  tool={tool}
                  onSelectTool={setTool}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onFit={handleFit}
                  onRotate={handleRotate}
                />
              </aside>

              {/* Content area */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {/* status/errors (no centering; keep it out of the canvas area) */}
                {masterImageLoading || masterImageError ? (
                  <div className="px-6 pt-4">
                    {masterImageLoading ? (
                      <div className="text-sm text-muted-foreground">Loading image…</div>
                    ) : null}
                    {masterImageError ? (
                      <div className="text-sm text-destructive">{masterImageError}</div>
                    ) : null}
                  </div>
                ) : null}

                {/* Workspace */}
                {masterImage ? (
                  <div className="min-h-0 flex-1">
                    {imageStateLoading ? (
                      <div className="flex h-full w-full items-center justify-center">
                        <div className="text-sm text-muted-foreground">Loading image state…</div>
                      </div>
                    ) : (
                      <ProjectCanvasStage
                        ref={canvasRef}
                        src={masterImage.signedUrl}
                        alt={masterImage.name}
                        className="h-full w-full"
                        panEnabled={panEnabled}
                        imageDraggable={imageDraggable}
                        artboardWidthPx={artboardPx?.w}
                        artboardHeightPx={artboardPx?.h}
                        onImageSizeChange={handleImagePxChange}
                        initialImageTransform={initialImageTransform}
                        onImageTransformCommit={saveImageState}
                      />
                    )}
                  </div>
                ) : (
                  <div className="min-h-0 flex-1">
                    <div className="flex h-full w-full items-center justify-center">
                      <ProjectImageUploader projectId={projectId} onUploaded={refreshMasterImage} />
                    </div>
                  </div>
                )}
              </div>
            </main>

            {/* Right sidebar belongs only to the Image tab (part of the content layout). */}
            <aside className="w-96 shrink-0 border-l bg-background">
              <div className="flex h-full flex-col">
                <div className="border-b px-4 py-3" data-testid="editor-artboard-panel">
                  <div className="text-sm font-medium">Artboard</div>
                  <div className="mt-3">
                    <ArtboardPanel
                      projectId={projectId}
                      onChangePx={handleArtboardPxChange}
                      onChangeMeta={(unit, dpi) => setArtboardMeta({ unit, dpi })}
                    />
                  </div>
                </div>
                <div className="border-b px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">Image</div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={!masterImage || masterImageLoading || deleteBusy}
                        aria-label="Restore image"
                        onClick={() => setRestoreOpen(true)}
                      >
                        <RotateCcw className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={!masterImage || masterImageLoading || deleteBusy}
                        aria-label="Delete image"
                        onClick={() => {
                          setDeleteError("")
                          setDeleteOpen(true)
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {/* Reserve space to avoid layout shift/flicker when this message appears/disappears. */}
                  <div className="mt-2 min-h-4 text-xs" aria-live="polite">
                    {imageStateError ? <span className="text-destructive">Image state error: {imageStateError}</span> : null}
                  </div>
                  <div className="mt-3">
                    <ImagePanel
                      widthPx={imagePx?.w ?? initialImagePx?.w ?? masterImage?.width_px}
                      heightPx={imagePx?.h ?? initialImagePx?.h ?? masterImage?.height_px}
                      unit={artboardMeta?.unit ?? "cm"}
                      dpi={artboardMeta?.dpi ?? 300}
                      disabled={!masterImage || imageStateLoading}
                      onCommit={(w, h) => canvasRef.current?.setImageSize(w, h)}
                      onAlign={(opts) => canvasRef.current?.alignImage(opts)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4">
                  {/* reserved for future controls */}
                </div>
              </div>
            </aside>

            {/* Restore confirmation dialog */}
            <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Restore image?</DialogTitle>
                  <DialogDescription>
                    This will reset the image position, scale, and rotation back to its default placement within the current
                    artboard.
                  </DialogDescription>
                </DialogHeader>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setRestoreOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      canvasRef.current?.restoreImage()
                      setRestoreOpen(false)
                    }}
                  >
                    Restore
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Delete confirmation dialog */}
            <Dialog open={deleteOpen} onOpenChange={(o) => (deleteBusy ? null : setDeleteOpen(o))}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete image?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete the master image from storage and remove its database record.
                  </DialogDescription>
                </DialogHeader>

                {deleteError ? <div className="text-sm text-destructive">{deleteError}</div> : null}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
                    Cancel
                  </Button>
                  <Button type="button" variant="destructive" onClick={handleDeleteMasterImage} disabled={deleteBusy}>
                    {deleteBusy ? "Deleting…" : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </EditorErrorBoundary>
        ) : (
          <main className="flex min-w-0 flex-1">
            {/* Other tabs: full-width content (no right sidebar). */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 py-6">
              <div className="text-sm text-muted-foreground">Coming soon.</div>
            </div>
          </main>
        )}
      </div>
    </div>
  )
}

