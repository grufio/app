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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SidebarContent, SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { EditorSidebarSection } from "@/features/editor/components/sidebar/editor-sidebar-section"
import { ToolbarIconButton } from "@/features/editor/components/toolbar-icon-button"
import { ProjectEditorHeader, ProjectEditorLayout } from "@/features/editor"
import type { ProjectCanvasStageHandle } from "@/features/editor/components/project-canvas-stage"
import { useFloatingToolbarControls } from "@/lib/editor/floating-toolbar-controls"
import { useProjectWorkspace } from "@/lib/editor/project-workspace"
import { useImageState } from "@/lib/editor/use-image-state"
import { useMasterImage } from "@/lib/editor/use-master-image"
import { useProjectImageFilters } from "@/lib/editor/use-project-image-filters"

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
  const { masterImage, masterImageError, masterImageLoading, refreshMasterImage } = useMasterImage(props.projectId, null)
  const { initialImageTransform, imageStateLoading, loadImageState } = useImageState(props.projectId, true, null, false)
  const canvasRef = useRef<ProjectCanvasStageHandle | null>(null)
  const filters = useProjectImageFilters(props.projectId)
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)

  useLoadImageStateOnActiveImageChange({ masterImageId: masterImage?.id ?? null, loadImageState })
  const toolbar = useFloatingToolbarControls({
    canvasRef,
    hasImage: Boolean(masterImage),
    masterImageLoading,
    imageStateLoading,
    enableShortcuts: false,
  })

  const handleRemoveFilter = async (filterId: string) => {
    const out = await filters.remove(filterId)
    if (!out.ok) return
    await refreshMasterImage()
    await loadImageState()
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
                    <SidebarMenuItem>
                      <SidebarMenuButton isActive={true} aria-current="page" className="text-xs">
                        <SlidersHorizontal />
                        <span>Neuer Filter</span>
                      </SidebarMenuButton>
                      <SidebarMenuAction
                        aria-label="Add filter"
                        disabled={filters.loading || masterImageLoading || imageStateLoading || !masterImage}
                        onClick={() => setIsFilterDialogOpen(true)}
                      >
                        <Plus />
                      </SidebarMenuAction>
                    </SidebarMenuItem>
                    {filters.items.map((f) => (
                      <SidebarMenuItem key={f.id}>
                        <SidebarMenuButton className="text-xs">
                          <SlidersHorizontal />
                          <span>{`Filter ${f.stack_order}: ${f.filter_type}`}</span>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          showOnHover
                          aria-label={`Remove filter ${f.stack_order}`}
                          disabled={filters.loading}
                          onClick={() => void handleRemoveFilter(f.id)}
                        >
                          <Trash2 />
                        </SidebarMenuAction>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                  {filters.error ? <div className="px-1 text-[11px] text-destructive">{filters.error}</div> : null}
                </EditorSidebarSection>
              </SidebarContent>
            </SidebarFrame>
          </aside>

          {/* Center canvas */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {masterImageError ? <div className="px-6 pt-4 text-sm text-destructive">{masterImageError}</div> : null}
            <div className="relative min-h-0 flex-1">
              <div className="absolute bottom-4 left-1/2 z-10 w-max -translate-x-1/2">
                <FilterFloatingToolbar
                  actionsDisabled={toolbar.actionsDisabled}
                  onZoomIn={toolbar.actions.zoomIn}
                  onZoomOut={toolbar.actions.zoomOut}
                  onFit={toolbar.actions.fit}
                />
              </div>
              {masterImageLoading ? (
                <div className="h-full w-full" aria-hidden="true" />
              ) : masterImage && imageStateLoading ? (
                <div className="h-full w-full" aria-hidden="true" />
              ) : (
                <ProjectCanvasStage
                  ref={canvasRef}
                  src={masterImage?.signedUrl ?? undefined}
                  activeImageId={masterImage?.id ?? null}
                  alt={masterImage?.name ?? undefined}
                  className="h-full w-full"
                  renderArtboard={true}
                  artboardWidthPx={widthPx ?? undefined}
                  artboardHeightPx={heightPx ?? undefined}
                  intrinsicWidthPx={
                    typeof masterImage?.width_px === "number" && Number.isFinite(masterImage.width_px)
                      ? masterImage.width_px
                      : undefined
                  }
                  intrinsicHeightPx={
                    typeof masterImage?.height_px === "number" && Number.isFinite(masterImage.height_px)
                      ? masterImage.height_px
                      : undefined
                  }
                  restoreBaseImageId={masterImage?.restore_base?.id ?? undefined}
                  restoreBaseWidthPx={
                    typeof masterImage?.restore_base?.width_px === "number" && Number.isFinite(masterImage.restore_base.width_px)
                      ? masterImage.restore_base.width_px
                      : undefined
                  }
                  restoreBaseHeightPx={
                    typeof masterImage?.restore_base?.height_px === "number" && Number.isFinite(masterImage.restore_base.height_px)
                      ? masterImage.restore_base.height_px
                      : undefined
                  }
                  initialImageTransform={masterImage ? initialImageTransform : null}
                  panEnabled={true}
                  imageDraggable={false}
                  cropEnabled={false}
                  rotateEnabled={false}
                  mutationsEnabled={false}
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
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <form>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>
                Make changes to your profile here. Click save when you&apos;re
                done.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <Label htmlFor="name-1">Name</Label>
                <Input id="name-1" name="name" defaultValue="Pedro Duarte" />
              </Field>
              <Field>
                <Label htmlFor="username-1">Username</Label>
                <Input id="username-1" name="username" defaultValue="@peduarte" />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </DialogContent>
        </form>
      </Dialog>
    </div>
  )
}

