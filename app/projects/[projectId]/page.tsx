"use client"

import { useParams } from "next/navigation"
import { useCallback, useMemo, useRef, useState } from "react"

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
import { ProjectWorkspaceProvider, useProjectWorkspace } from "@/lib/editor/project-workspace"
import { useMasterImage } from "@/lib/editor/use-master-image"
import { useProject } from "@/lib/editor/use-project"
import { useImageState } from "@/lib/editor/use-image-state"

function ProjectDetailPageInner({ projectId }: { projectId: string }) {
  const { unit: workspaceUnit, dpi: workspaceDpi, widthPx: artboardWidthPx, heightPx: artboardHeightPx, loading: workspaceLoading } =
    useProjectWorkspace()
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

  const [selectedNavId, setSelectedNavId] = useState<string>("app")

  const [leftPanelWidthRem, setLeftPanelWidthRem] = useState(20)
  const [rightPanelWidthRem, setRightPanelWidthRem] = useState(20)
  const minPanelRem = 18
  const maxPanelRem = 24

  const [pageBgEnabled, setPageBgEnabled] = useState(false)
  const [pageBgColor, setPageBgColor] = useState("#ffffff")
  const [pageBgOpacity, setPageBgOpacity] = useState(50)

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

  const activeRightSection = selectedNavId.startsWith("app/api") ? "image" : "artboard"

  return (
    <div className="flex min-h-svh w-full flex-col">
      <ProjectEditorHeader
        projectId={projectId}
        initialTitle={project?.id === projectId ? project.name : "Untitled"}
        onTitleUpdated={(nextTitle) => setProject({ id: projectId, name: nextTitle })}
      />

      {/* Content row */}
      <ProjectEditorLayout>
        <EditorErrorBoundary resetKey={`${projectId}:${masterImage?.signedUrl ?? "no-image"}`}>
          <main className="flex min-w-0 flex-1">
            <ProjectEditorLeftPanel
              widthRem={leftPanelWidthRem}
              minRem={minPanelRem}
              maxRem={maxPanelRem}
              onWidthRemChange={setLeftPanelWidthRem}
              selectedId={selectedNavId}
              onSelect={setSelectedNavId}
            />
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
              pageBgEnabled={pageBgEnabled}
              pageBgColor={pageBgColor}
              pageBgOpacity={pageBgOpacity}
            />
          </main>

          <ProjectEditorRightPanel
            panelWidthRem={rightPanelWidthRem}
            minPanelRem={minPanelRem}
            maxPanelRem={maxPanelRem}
            onPanelWidthRemChange={setRightPanelWidthRem}
            activeSection={activeRightSection}
            pageBgEnabled={pageBgEnabled}
            pageBgColor={pageBgColor}
            pageBgOpacity={pageBgOpacity}
            onPageBgEnabledChange={setPageBgEnabled}
            onPageBgColorChange={(c) => {
              setPageBgColor(c)
              setPageBgEnabled(true)
            }}
            onPageBgOpacityChange={(o) => {
              setPageBgOpacity(o)
              setPageBgEnabled(true)
            }}
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
            canvasRef={canvasRef}
          />
        </EditorErrorBoundary>
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

