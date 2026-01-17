"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { getMasterImage } from "@/lib/api/project-images"

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const [tab, setTab] = useState<"image" | "filter" | "convert" | "output">(
    "image"
  )
  const projectId = params.projectId
  const [project, setProject] = useState<{ id: string; name: string } | null>(
    null
  )
  const [masterImage, setMasterImage] = useState<{
    signedUrl: string
    width_px: number
    height_px: number
    name: string
  } | null>(null)
  const [masterImageLoading, setMasterImageLoading] = useState(false)
  const [masterImageError, setMasterImageError] = useState<string>("")
  const [imageStateError, setImageStateError] = useState<string>("")
  const [imageStateLoading, setImageStateLoading] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string>("")
  const [tool, setTool] = useState<"select" | "hand">("hand")
  const panEnabled = tool === "hand"
  const imageDraggable = tool === "select"
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const [artboardPx, setArtboardPx] = useState<{ w: number; h: number } | null>(null)
  const [imagePx, setImagePx] = useState<{ w: number; h: number } | null>(null)
  const [initialImageTransform, setInitialImageTransform] = useState<{
    x: number
    y: number
    scaleX: number
    scaleY: number
    widthPx?: number
    heightPx?: number
    rotationDeg: number
  } | null>(null)
  const [artboardMeta, setArtboardMeta] = useState<{ unit: "mm" | "cm" | "pt" | "px"; dpi: number } | null>(null)

  const handleArtboardPxChange = useCallback((w: number, h: number) => {
    setArtboardPx({ w, h })
  }, [])

  const handleImagePxChange = useCallback((w: number, h: number) => {
    setImagePx((prev) => {
      if (prev && prev.w === w && prev.h === h) return prev
      return { w, h }
    })
  }, [])

  const refreshMasterImage = useCallback(async () => {
    setMasterImageError("")
    setMasterImageLoading(true)
    try {
      const payload = await getMasterImage(projectId)
      if (!payload?.exists) {
        setMasterImage(null)
        return
      }
      setMasterImage({
        signedUrl: payload.signedUrl,
        width_px: Number(payload.width_px ?? 0),
        height_px: Number(payload.height_px ?? 0),
        name: String(payload.name ?? "master image"),
      })
    } catch (e) {
      setMasterImage(null)
      setMasterImageError(e instanceof Error ? e.message : "Failed to load image")
    } finally {
      setMasterImageLoading(false)
    }
  }, [projectId])

  const loadImageState = useCallback(async () => {
    setImageStateError("")
    setImageStateLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/image-state`, {
        method: "GET",
        credentials: "same-origin",
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
        const msg =
          typeof payload?.error === "string"
            ? payload.error
            : payload
              ? JSON.stringify(payload)
              : `HTTP ${res.status}`
        setImageStateError(msg)
        setInitialImageTransform(null)
        return
      }
      const payload = (await res.json().catch(() => null)) as
        | {
            exists?: boolean
            state?: {
              x: number
              y: number
              scale_x: number
              scale_y: number
              width_px?: number | null
              height_px?: number | null
              unit?: "mm" | "cm" | "pt" | "px" | null
              dpi?: number | null
              rotation_deg: number
            }
          }
        | null
      if (!payload?.exists || !payload.state) {
        setInitialImageTransform(null)
        return
      }
      setInitialImageTransform({
        x: Number(payload.state.x),
        y: Number(payload.state.y),
        scaleX: Number(payload.state.scale_x),
        scaleY: Number(payload.state.scale_y),
        widthPx: payload.state.width_px == null ? undefined : Number(payload.state.width_px),
        heightPx: payload.state.height_px == null ? undefined : Number(payload.state.height_px),
        rotationDeg: Number(payload.state.rotation_deg),
      })
    } catch (e) {
      console.error("Failed to load image state", e)
      setImageStateError("Failed to load image state.")
      setInitialImageTransform(null)
    } finally {
      setImageStateLoading(false)
    }
  }, [projectId])

  const saveImageState = useCallback(
    async (t: {
      x: number
      y: number
      scaleX: number
      scaleY: number
      widthPx?: number
      heightPx?: number
      unit?: "mm" | "cm" | "pt" | "px"
      dpi?: number
      rotationDeg: number
    }) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/image-state`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "master",
            x: t.x,
            y: t.y,
            scale_x: t.scaleX,
            scale_y: t.scaleY,
            width_px: t.widthPx,
            height_px: t.heightPx,
            unit: t.unit,
            dpi: t.dpi,
            rotation_deg: t.rotationDeg,
          }),
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
          const msg =
            typeof payload?.error === "string"
              ? payload.error
              : payload
                ? JSON.stringify(payload)
                : `HTTP ${res.status}`
          setImageStateError(msg)
        } else {
          setImageStateError("")
        }
      } catch (e) {
        console.error("Failed to save image state", e)
        setImageStateError("Failed to save image state.")
      }
    },
    [projectId]
  )


  const deleteMasterImage = useCallback(async () => {
    if (deleteBusy) return
    setDeleteError("")
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/images/master`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
        const msg =
          typeof payload?.error === "string"
            ? payload.error
            : payload
              ? JSON.stringify(payload)
              : `HTTP ${res.status}`
        setDeleteError(msg)
        return
      }
      setDeleteOpen(false)
      setMasterImage(null)
      setImagePx(null)
      setInitialImageTransform(null)
      // Ensure uploader shows again even if some cached state exists.
      void refreshMasterImage()
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteBusy, projectId, refreshMasterImage])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single()

      if (!cancelled && !error) {
        setProject({ id: projectId, name: data?.name ?? "" })
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [projectId])

  useEffect(() => {
    void refreshMasterImage()
  }, [refreshMasterImage])

  useEffect(() => {
    if (!masterImage) {
      setInitialImageTransform(null)
      setImageStateError("")
      setImageStateLoading(false)
      setArtboardMeta(null)
      return
    }
    void loadImageState()
  }, [loadImageState, masterImage])

  // When persisted image state loads, reflect it in the Image panel immediately (avoid artboard-fit snap on reload).
  useEffect(() => {
    if (!masterImage || !initialImageTransform) return
    const w =
      Number.isFinite(Number(initialImageTransform.widthPx)) && Number(initialImageTransform.widthPx) > 0
        ? Math.round(Number(initialImageTransform.widthPx))
        : Math.round(masterImage.width_px * initialImageTransform.scaleX)
    const h =
      Number.isFinite(Number(initialImageTransform.heightPx)) && Number(initialImageTransform.heightPx) > 0
        ? Math.round(Number(initialImageTransform.heightPx))
        : Math.round(masterImage.height_px * initialImageTransform.scaleY)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
    setImagePx((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
  }, [initialImageTransform, masterImage])

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
            <TabsTrigger value="filter">Filter / Optimierung</TabsTrigger>
            <TabsTrigger value="convert">Vektorisierung / Grid</TabsTrigger>
            <TabsTrigger value="output">PDF Output</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content row (starts under the same top divider line for both left + right sidebars) */}
      <div className="flex flex-1 border-t border-border bg-muted/50">
        {tab === "image" ? (
          <>
            {/* Main content (left tools + canvas/uploader) */}
            <main className="flex min-w-0 flex-1">
              {/* Template-level left sidebar (Illustrator-style) */}
              <aside className="flex w-12 shrink-0 justify-center border-r bg-background/80 py-2">
                <CanvasToolSidebar
                  tool={tool}
                  onSelectTool={setTool}
                  onZoomIn={() => canvasRef.current?.zoomIn()}
                  onZoomOut={() => canvasRef.current?.zoomOut()}
                  onFit={() => canvasRef.current?.fitToView()}
                  onRotate={() => canvasRef.current?.rotate90()}
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
                <div className="border-b px-4 py-3">
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
                  {imageStateError ? (
                    <div className="mt-2 text-xs text-destructive">
                      Image state error: {imageStateError}
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <ImagePanel
                      widthPx={imagePx?.w ?? masterImage?.width_px}
                      heightPx={imagePx?.h ?? masterImage?.height_px}
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
                  <Button type="button" variant="destructive" onClick={deleteMasterImage} disabled={deleteBusy}>
                    {deleteBusy ? "Deleting…" : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
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

