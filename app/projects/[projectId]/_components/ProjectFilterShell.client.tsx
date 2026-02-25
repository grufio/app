"use client"

/**
 * Filter tab shell.
 *
 * Requirements:
 * - Center canvas shows the *currently active image* (same as Image tab) incl. persisted transform.
 * - Read-only: only pan + zoom; no move/resize/crop/rotate, no persistence writes.
 * - Artboard geometry inherits from the workspace (same as Image tab).
 * - Left sidebar contains a tree entry "Neuer Filter" with a "+" action.
 * - Right sidebar has an empty "Filter" section.
 */
import dynamic from "next/dynamic"
import { Hand, Maximize2, Plus, SlidersHorizontal, Trash2, ZoomIn, ZoomOut } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { SidebarContent, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EditorSidebarSection } from "@/features/editor/components/sidebar/editor-sidebar-section"
import { FilterSelectionController } from "@/features/editor/components/FilterSelectionController"
import { PixelateFilterController } from "@/features/editor/components/PixelateFilterController"
import { LineArtFilterController } from "@/features/editor/components/LineArtFilterController"
import { ToolbarIconButton } from "@/features/editor/components/toolbar-icon-button"
import { ProjectEditorHeader, ProjectEditorLayout } from "@/features/editor"
import type { ProjectCanvasStageHandle } from "@/features/editor/components/project-canvas-stage"
import { useFloatingToolbarControls } from "@/lib/editor/floating-toolbar-controls"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { useImageState } from "@/lib/editor/use-image-state"
import { useFilterWorkingImage } from "@/lib/editor/use-filter-working-image"
import { useFilterStack } from "@/lib/editor/use-filter-stack"
import { removeActiveFilter } from "@/lib/api/project-images"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

const ProjectCanvasStage = dynamic(
  () => import("@/features/editor/components/project-canvas-stage").then((m) => m.ProjectCanvasStage),
  { ssr: false, loading: () => <div className="h-full w-full" aria-hidden="true" /> }
)

function FilterFloatingToolbar(props: {
  actionsDisabled: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}) {
  const { actionsDisabled, onZoomIn, onZoomOut, onFit } = props

  return (
    <TooltipProvider delayDuration={150}>
      <div
        role="toolbar"
        aria-label="Canvas toolbar"
        className="inline-flex items-center gap-3 rounded-lg border bg-background/90 px-2 py-1 shadow-sm backdrop-blur"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarIconButton label="Hand (Move Artboard)" active={true}>
              <Hand className="size-6" strokeWidth={1} />
            </ToolbarIconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            Hand (Move Artboard)
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarIconButton label="Zoom in" disabled={actionsDisabled} onClick={onZoomIn}>
              <ZoomIn className="size-6" strokeWidth={1} />
            </ToolbarIconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            Zoom in
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarIconButton label="Zoom out" disabled={actionsDisabled} onClick={onZoomOut}>
              <ZoomOut className="size-6" strokeWidth={1} />
            </ToolbarIconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            Zoom out
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarIconButton label="Fit to screen" disabled={actionsDisabled} onClick={onFit}>
              <Maximize2 className="size-6" strokeWidth={1} />
            </ToolbarIconButton>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            Fit to screen
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

function useLoadImageStateOnActiveImageChange(args: { masterImageId: string | null; loadImageState: () => Promise<void> }) {
  const loadedForIdRef = useRef<string | null>(null)
  const { masterImageId, loadImageState } = args
  useEffect(() => {
    if (!masterImageId) {
      loadedForIdRef.current = null
      return
    }
    if (loadedForIdRef.current === masterImageId) return
    loadedForIdRef.current = masterImageId
    void loadImageState()
  }, [loadImageState, masterImageId])
}

export function ProjectFilterPageClient(props: { projectId: string }) {
  const { widthPx, heightPx } = useProjectWorkspace()
  const { image: workingImage, loading: workingImageLoading, error: workingImageError, refresh: refreshWorkingImage } = useFilterWorkingImage(props.projectId)
  const { initialImageTransform, imageStateLoading, loadImageState } = useImageState(props.projectId, true, null, false)
  const filterStack = useFilterStack(props.projectId, workingImage?.id ?? null)

  // Debug: Log filter stack
  useEffect(() => {
    console.log("[FilterStack]", {
      displayImageId: workingImage?.id,
      stackLength: filterStack.stack.length,
      stack: filterStack.stack,
    })
  }, [workingImage?.id, filterStack.stack])
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const [activeFilterType, setActiveFilterType] = useState<"pixelate" | "lineart" | null>(null)
  const [showFilterSelection, setShowFilterSelection] = useState(false)
  const [removingFilter, setRemovingFilter] = useState(false)

  useLoadImageStateOnActiveImageChange({ masterImageId: workingImage?.id ?? null, loadImageState })
  const toolbar = useFloatingToolbarControls({
    canvasRef,
    hasImage: Boolean(workingImage),
    masterImageLoading: workingImageLoading,
    imageStateLoading,
    enableShortcuts: false,
  })

  const handleRemoveSpecificFilter = async (filterId: string) => {
    if (removingFilter) return
    setRemovingFilter(true)
    try {
      const supabase = createSupabaseBrowserClient()
      
      await supabase
        .from("project_images")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", filterId)
      
      await refreshWorkingImage()
      await filterStack.refresh()
    } catch (e) {
      console.error("Failed to remove filter:", e)
      alert(e instanceof Error ? e.message : "Failed to remove filter")
    } finally {
      setRemovingFilter(false)
    }
  }

  const handleRemoveFilter = async () => {
    if (!workingImage || removingFilter) return
    setRemovingFilter(true)
    try {
      await removeActiveFilter(props.projectId)
      await refreshWorkingImage()
    } catch (e) {
      console.error("Failed to remove filter:", e)
      alert(e instanceof Error ? e.message : "Failed to remove filter")
    } finally {
      setRemovingFilter(false)
    }
  }

  const handleFilterSuccess = async () => {
    await refreshWorkingImage()
    await filterStack.refresh()
  }

  const handleFilterSelect = (filterType: "pixelate" | "lineart") => {
    setShowFilterSelection(false)
    setActiveFilterType(filterType)
  }

  const handleCloseActiveFilter = () => {
    setActiveFilterType(null)
  }

  return (
    <div className="flex min-h-svh w-full flex-col">
      <ProjectEditorHeader projectId={props.projectId} />

      <ProjectEditorLayout>
        <main className="flex min-w-0 flex-1">
          {/* Left sidebar */}
          <aside className="shrink-0 border-r bg-white" aria-label="Filter navigation" style={{ width: "20rem" }}>
            <SidebarFrame className="block min-h-0 w-full">
              <SidebarContent className="gap-0">
                <EditorSidebarSection title="Filter">
                  <SidebarMenu>
                    {filterStack.stack.map((filter) => (
                      <SidebarMenuItem key={filter.id}>
                        <SidebarMenuButton isActive={true} className="text-xs">
                          <SlidersHorizontal />
                          <span>{filter.filterType === "pixelate" ? "Pixelate" : filter.filterType === "lineart" ? "Line Art" : "Filter"}</span>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          aria-label={`Remove filter`}
                          disabled={removingFilter}
                          onClick={() => handleRemoveSpecificFilter(filter.id)}
                        >
                          <Trash2 />
                        </SidebarMenuAction>
                      </SidebarMenuItem>
                    ))}
                    
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={filterStack.stack.length === 0} aria-current={filterStack.stack.length === 0 ? "page" : undefined} className="text-xs">
                        <SlidersHorizontal />
                        <span>Neuer Filter</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        aria-label="Add filter"
                        disabled={workingImageLoading || imageStateLoading || !workingImage}
                        onClick={() => setShowFilterSelection(true)}
                      >
                        <Plus />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </EditorSidebarSection>
              </SidebarContent>
            </SidebarFrame>
          </aside>

          {/* Center canvas */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {workingImageError ? <div className="px-6 pt-4 text-sm text-destructive">{workingImageError}</div> : null}
            <div className="relative min-h-0 flex-1">
              <div className="absolute bottom-4 left-1/2 z-10 w-max -translate-x-1/2">
                <FilterFloatingToolbar
                  actionsDisabled={toolbar.actionsDisabled}
                  onZoomIn={toolbar.actions.zoomIn}
                  onZoomOut={toolbar.actions.zoomOut}
                  onFit={toolbar.actions.fit}
                />
              </div>
              {workingImageLoading ? (
                <div className="h-full w-full" aria-hidden="true" />
              ) : workingImage && imageStateLoading ? (
                <div className="h-full w-full" aria-hidden="true" />
              ) : (
                <ProjectCanvasStage
                  ref={canvasRef}
                  src={workingImage?.signedUrl ?? undefined}
                  activeImageId={workingImage?.id ?? null}
                  alt="Filter working copy"
                  className="h-full w-full"
                  renderArtboard={true}
                  artboardWidthPx={widthPx ?? undefined}
                  artboardHeightPx={heightPx ?? undefined}
                  intrinsicWidthPx={
                    typeof workingImage?.width_px === "number" && Number.isFinite(workingImage.width_px)
                      ? workingImage.width_px
                      : undefined
                  }
                  intrinsicHeightPx={
                    typeof workingImage?.height_px === "number" && Number.isFinite(workingImage.height_px)
                      ? workingImage.height_px
                      : undefined
                  }
                  restoreBaseWidthPx={undefined}
                  restoreBaseHeightPx={undefined}
                  initialImageTransform={workingImage ? initialImageTransform : null}
                  panEnabled={true}
                  imageDraggable={false}
                  cropEnabled={false}
                  rotateEnabled={false}
                  mutationsEnabled={false}
                  clipToArtboard={true}
                />
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <aside className="shrink-0 border-l bg-background" aria-label="Filter controls" style={{ width: "20rem" }}>
            <SidebarFrame className="block h-full min-h-0 w-full">
              <SidebarContent className="gap-0">
                <EditorSidebarSection title="Filter">
                  <div />
                </EditorSidebarSection>
              </SidebarContent>
            </SidebarFrame>
          </aside>
        </main>
      </ProjectEditorLayout>
      <FilterSelectionController
        workingImageUrl={workingImage?.signedUrl ?? null}
        open={showFilterSelection}
        onClose={() => setShowFilterSelection(false)}
        onSelect={handleFilterSelect}
      />
      {workingImage && (
        <>
          <PixelateFilterController
            projectId={props.projectId}
            workingImageId={workingImage.id}
            workingImageWidth={workingImage.width_px}
            workingImageHeight={workingImage.height_px}
            open={activeFilterType === "pixelate"}
            onClose={handleCloseActiveFilter}
            onSuccess={handleFilterSuccess}
          />
          <LineArtFilterController
            projectId={props.projectId}
            workingImageId={workingImage.id}
            open={activeFilterType === "lineart"}
            onClose={handleCloseActiveFilter}
            onSuccess={handleFilterSuccess}
          />
        </>
      )}
    </div>
  )
}

