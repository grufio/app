"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ProjectImageUploader } from "@/components/app-img-upload"
import { ProjectImageCanvas, type ProjectImageCanvasHandle } from "@/components/app-canvas-img"
import { ProjectToolSidebar } from "@/components/app-sidebar-canvas"
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
  const [panEnabled, setPanEnabled] = useState(true)
  const canvasRef = useRef<ProjectImageCanvasHandle | null>(null)

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
    <div className="flex min-h-svh w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Breadcrumb header row: same structure/spacing as dashboard header, only the left icon differs */}
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <Link
              href="/dashboard"
              aria-label="Back to dashboard"
              className="-ml-1 inline-flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Project</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {project?.id === projectId ? project.name || "Untitled" : "Untitled"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

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

        <main className="flex flex-1 border-t border-border bg-muted/50">
          {tab === "image" ? (
            <>
              {/* Template-level left sidebar (Illustrator-style) */}
              <aside className="flex w-12 shrink-0 justify-center border-r bg-background/80 py-2">
                <ProjectToolSidebar
                  panEnabled={panEnabled}
                  onTogglePan={() => setPanEnabled((v) => !v)}
                  onZoomIn={() => canvasRef.current?.zoomIn()}
                  onZoomOut={() => canvasRef.current?.zoomOut()}
                  onFit={() => canvasRef.current?.fitToView()}
                  onRotate={() => canvasRef.current?.rotate90()}
                />
              </aside>

              {/* Content area */}
              <div className="flex min-w-0 flex-1 items-center justify-center p-6">
                <div className="w-full max-w-3xl space-y-4">
                  {masterImageLoading ? (
                    <div className="text-sm text-muted-foreground">Loading image…</div>
                  ) : null}
                  {masterImageError ? (
                    <div className="text-sm text-destructive">{masterImageError}</div>
                  ) : null}

                  {masterImage ? (
                    <div className="overflow-hidden rounded-lg border bg-background">
                      <ProjectImageCanvas
                        ref={(n) => {
                          canvasRef.current = n
                        }}
                        src={masterImage.signedUrl}
                        alt={masterImage.name}
                        className="h-[520px] w-full"
                        panEnabled={panEnabled}
                      />
                    </div>
                  ) : null}

                  <ProjectImageUploader projectId={projectId} onUploaded={refreshMasterImage} />
                </div>
              </div>
            </>
          ) : null}
        </main>
      </div>

      {/* Right sidebar (always visible, non-modal) */}
      <aside className="h-svh w-96 shrink-0 border-l bg-background">
        <div className="sticky top-0 flex h-svh flex-col">
          <div className="border-b px-4 py-3">
            <div className="text-sm font-medium">Sidebar</div>
            <div className="text-xs text-muted-foreground">
              Funktionen zum Bearbeiten (wie Illustrator)
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-3">
              <div className="h-10 rounded-md bg-muted" />
              <div className="h-10 rounded-md bg-muted" />
              <div className="h-10 rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

