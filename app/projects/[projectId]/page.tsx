"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectImageUploader } from "@/components/app-img-upload"
import { ProjectImageCanvas, type ProjectImageCanvasHandle } from "@/components/app-canvas-img"
import { ProjectToolSidebar } from "@/components/app-sidebar-canvas"
import { ProjectDetailHeader } from "@/components/app-header-project"
import { ArtboardFields } from "@/components/app-artboard-fields"
import { ImageFields } from "@/components/app-image-fields"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

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
  const [tool, setTool] = useState<"select" | "hand">("hand")
  const panEnabled = tool === "hand"
  const imageDraggable = tool === "select"
  const canvasRef = useRef<ProjectImageCanvasHandle | null>(null)
  const [artboardPx, setArtboardPx] = useState<{ w: number; h: number } | null>(null)
  const [imagePx, setImagePx] = useState<{ w: number; h: number } | null>(null)
  const [artboardMeta, setArtboardMeta] = useState<{ unit: "mm" | "cm" | "pt" | "px"; dpi: number } | null>(
    null
  )

  const handleArtboardPxChange = useCallback((w: number, h: number) => {
    setArtboardPx({ w, h })
  }, [])

  const refreshMasterImage = async () => {
    setMasterImageError("")
    setMasterImageLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/images/master`, {
        method: "GET",
        credentials: "same-origin",
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
        setMasterImage(null)
        setMasterImageError(
          `Failed to load image (HTTP ${res.status}) ` + (payload ? JSON.stringify(payload) : "")
        )
        return
      }
      const payload = (await res.json().catch(() => null)) as
        | { exists?: boolean; signedUrl?: string; width_px?: number; height_px?: number; name?: string }
        | null
      if (!payload?.exists || !payload.signedUrl) {
        setMasterImage(null)
        return
      }
      setMasterImage({
        signedUrl: payload.signedUrl,
        width_px: Number(payload.width_px ?? 0),
        height_px: Number(payload.height_px ?? 0),
        name: String(payload.name ?? "master image"),
      })
    } finally {
      setMasterImageLoading(false)
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return (
    <div className="flex min-h-svh w-full flex-col">
      <ProjectDetailHeader
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
        <main className="flex min-w-0 flex-1">
          {tab === "image" ? (
            <>
              {/* Template-level left sidebar (Illustrator-style) */}
              <aside className="flex w-12 shrink-0 justify-center border-r bg-background/80 py-2">
                <ProjectToolSidebar
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

                {/* Workspace: use 100% of the available gray content area */}
                <div className="min-h-0 flex-1">
                  {masterImage ? (
                    <ProjectImageCanvas
                      ref={(n) => {
                        canvasRef.current = n
                      }}
                      src={masterImage.signedUrl}
                      alt={masterImage.name}
                      className="h-full w-full"
                      panEnabled={panEnabled}
                      imageDraggable={imageDraggable}
                      artboardWidthPx={artboardPx?.w}
                      artboardHeightPx={artboardPx?.h}
                      onImageSizeChange={(w, h) => setImagePx({ w, h })}
                    />
                  ) : null}
                </div>

                {/* Uploader lives below the workspace only when no image exists */}
                {!masterImage ? (
                  <div className="px-6 pb-6">
                    <ProjectImageUploader projectId={projectId} onUploaded={refreshMasterImage} />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </main>

        {/* Right sidebar (aligned under the same top divider line) */}
        <aside className="w-96 shrink-0 border-l bg-background">
          <div className="flex h-full flex-col">
            <div className="border-b px-4 py-3">
              <div className="text-sm font-medium">Artboard</div>
              <div className="mt-3">
                <ArtboardFields
                  key={`${projectId}-artboard-fields`}
                  projectId={projectId}
                  onChangePx={handleArtboardPxChange}
                  onChangeMeta={(unit, dpi) => setArtboardMeta({ unit, dpi })}
                />
              </div>
            </div>
            <div className="border-b px-4 py-3">
              <div className="text-sm font-medium">Image</div>
              <div className="mt-3">
                <ImageFields
                  key={`${imagePx?.w ?? masterImage?.width_px ?? ""}x${imagePx?.h ?? masterImage?.height_px ?? ""}`}
                  widthPx={imagePx?.w ?? masterImage?.width_px}
                  heightPx={imagePx?.h ?? masterImage?.height_px}
                  unit={artboardMeta?.unit ?? "cm"}
                  dpi={artboardMeta?.dpi ?? 300}
                  disabled={!masterImage}
                  onCommit={(w, h) => canvasRef.current?.setImageSize(w, h)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {/* reserved for future controls */}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

