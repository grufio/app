"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  type ProjectCanvasStageHandle,
  ProjectEditorHeader,
} from "@/components/shared/editor"
import { EditorErrorBoundary } from "@/components/shared/editor/editor-error-boundary"
import { ProjectEditorLayout } from "@/components/project-editor/ProjectEditorLayout"
import { ProjectEditorLeftPanel } from "@/components/project-editor/ProjectEditorLeftPanel"
import { ProjectEditorRightPanel } from "@/components/project-editor/ProjectEditorRightPanel"
import { ProjectEditorStage } from "@/components/project-editor/ProjectEditorStage"
import { computeImagePanelReady, computeWorkspaceReady } from "@/lib/editor/editor-ready"
import { useFloatingToolbarControls } from "@/lib/editor/floating-toolbar-controls"
import { buildLayersTree } from "@/lib/editor/layers-tree"
import { ProjectWorkspaceProvider, useProjectWorkspace } from "@/lib/editor/project-workspace"
import { useMasterImage } from "@/lib/editor/use-master-image"
import { useProject } from "@/lib/editor/use-project"
import { useImageState } from "@/lib/editor/use-image-state"
import {
  readSelectedLayerId,
  writeSelectedLayerId,
} from "@/lib/editor/layer-selection-storage"

function ProjectDetailPageInner({ projectId }: { projectId: string }) {
  const { unit: workspaceUnit, dpi: workspaceDpi, widthPx: artboardWidthPx, heightPx: artboardHeightPx, loading: workspaceLoading } =
    useProjectWorkspace()
  const [tab, setTab] = useState<"image" | "filter" | "convert" | "output">("image")
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
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const [imagePxU, setImagePxU] = useState<{ w: bigint; h: bigint } | null>(null)
  const { initialImageTransform, imageStateLoading, saveImageState } = useImageState(
    projectId,
    Boolean(masterImage)
  )

  const initialImagePxU = useMemo(() => {
    if (!masterImage || !initialImageTransform) return null
    const wU = initialImageTransform.widthPxU
    const hU = initialImageTransform.heightPxU
    if (!wU || !hU || wU <= 0n || hU <= 0n) return null
    return { w: wU, h: hU }
  }, [initialImageTransform, masterImage])

  const handleImagePxChange = useCallback((w: bigint, h: bigint) => {
    setImagePxU((prev) => {
      if (prev && prev.w === w && prev.h === h) return prev
      return { w, h }
    })
  }, [])

  const handleDeleteMasterImage = useCallback(async () => {
    const res = await deleteImage()
    if (!res.ok) return
    setDeleteOpen(false)
    setImagePxU(null)
  }, [deleteImage])

  const toolbar = useFloatingToolbarControls({
    canvasRef,
    hasImage: Boolean(masterImage),
    masterImageLoading,
    imageStateLoading,
    enableShortcuts: true,
  })

  const [selectedNodeId, setSelectedNodeId] = useState<string>(() => {
    return readSelectedLayerId(projectId)
  })

  const layersRoot = useMemo(() => {
    const images = masterImage
      ? [
          {
            imageId: "master",
            label: masterImage.name ?? "Image",
            // Filters are not modeled yet; keep empty for now.
            filters: [],
          },
        ]
      : []
    return buildLayersTree({ images })
  }, [masterImage])

  const validLayerIds = useMemo(() => {
    const ids = new Set<string>()
    const walk = (n: { id: string; children?: unknown }) => {
      ids.add(n.id)
      const kids = (n as { children?: { id: string; children?: unknown }[] }).children ?? []
      for (const c of kids) walk(c)
    }
    walk(layersRoot)
    return ids
  }, [layersRoot])

  const selectedNodeIdEffective = validLayerIds.has(selectedNodeId) ? selectedNodeId : "artboard"

  useEffect(() => {
    writeSelectedLayerId(projectId, selectedNodeIdEffective)
  }, [projectId, selectedNodeIdEffective])

  const handleSelectLayer = useCallback(
    (n: { id: string; kind: "artboard" | "image" | "filter" }) => {
      setSelectedNodeId(n.id)
      if (n.kind === "filter") setTab("filter")
      else setTab("image")

      if (n.kind === "artboard") toolbar.setTool("hand")
      else toolbar.setTool("select")
    },
    [toolbar]
  )

  const panelImagePxU = useMemo(() => {
    // Avoid the "flash" of raw master px sizes before persisted image-state arrives.
    if (imageStateLoading) return null
    return imagePxU ?? initialImagePxU ?? null
  }, [imagePxU, imageStateLoading, initialImagePxU])

  const workspaceReady = computeWorkspaceReady({
    workspaceLoading,
    workspaceUnit,
    workspaceDpi,
  })

  const imagePanelReady = computeImagePanelReady({
    workspaceReady,
    masterImage,
    imageStateLoading,
    panelImagePxU,
  })

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
      <ProjectEditorLayout>
        {tab === "image" ? (
          <EditorErrorBoundary resetKey={`${projectId}:${masterImage?.signedUrl ?? "no-image"}`}>
            {/* Main content (left tools + canvas/uploader) */}
            <main className="flex min-w-0 flex-1">
              {/* Template-level left sidebar (Illustrator-style) */}
              <ProjectEditorLeftPanel
                layersRoot={layersRoot}
                selectedNodeIdEffective={selectedNodeIdEffective}
                handleSelectLayer={handleSelectLayer}
              />

              {/* Content area */}
              <ProjectEditorStage
                projectId={projectId}
                masterImage={masterImage}
                masterImageLoading={masterImageLoading}
                masterImageError={masterImageError}
                refreshMasterImage={refreshMasterImage}
                imageStateLoading={imageStateLoading}
                toolbar={toolbar}
                canvasRef={canvasRef}
                artboardWidthPx={artboardWidthPx ?? undefined}
                artboardHeightPx={artboardHeightPx ?? undefined}
                handleImagePxChange={handleImagePxChange}
                initialImageTransform={initialImageTransform}
                saveImageState={saveImageState}
              />
            </main>

            {/* Right sidebar belongs only to the Image tab (part of the content layout). */}
            <ProjectEditorRightPanel
              masterImage={masterImage}
              masterImageLoading={masterImageLoading}
              deleteBusy={deleteBusy}
              deleteError={deleteError}
              setDeleteError={setDeleteError}
              restoreOpen={restoreOpen}
              setRestoreOpen={setRestoreOpen}
              deleteOpen={deleteOpen}
              setDeleteOpen={setDeleteOpen}
              handleDeleteMasterImage={handleDeleteMasterImage}
              panelImagePxU={panelImagePxU}
              workspaceUnit={workspaceUnit ?? "cm"}
              workspaceDpi={workspaceDpi ?? 300}
              workspaceReady={workspaceReady}
              imageStateLoading={imageStateLoading}
              imagePanelReady={imagePanelReady}
              canvasRef={canvasRef as any}
            />
          </EditorErrorBoundary>
        ) : (
          <main className="flex min-w-0 flex-1">
            {/* Other tabs: full-width content (no right sidebar). */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 py-6">
              <div className="text-sm text-muted-foreground">Coming soon.</div>
            </div>
          </main>
        )}
      </ProjectEditorLayout>
    </div>
  )
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const projectId = params.projectId
  return (
    <ProjectWorkspaceProvider projectId={projectId}>
      <ProjectDetailPageInner key={projectId} projectId={projectId} />
    </ProjectWorkspaceProvider>
  )
}

