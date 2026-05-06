"use client"

/**
 * Right panel for the project editor (controls).
 *
 * Responsibilities:
 * - Page background controls (color/opacity/visibility).
 * - Contextual editor panels (grid, artboard, image actions).
 */
import * as React from "react"
import dynamic from "next/dynamic"
import { EyeOff, Percent, RotateCcw, Trash2 } from "lucide-react"

import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import { AppButton } from "@/components/ui/form-controls"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SidebarContent } from "@/components/ui/sidebar"
// Code-split non-canvas panels to reduce initial editor bundle cost.
const GridPanel = dynamic(() => import("./grid-panel").then((m) => m.GridPanel), {
  ssr: false,
  loading: () => null,
})
const ArtboardPanel = dynamic(() => import("./artboard-panel").then((m) => m.ArtboardPanel), {
  ssr: false,
  loading: () => null,
})
const ImagePanel = dynamic(() => import("./image-panel").then((m) => m.ImagePanel), {
  ssr: false,
  loading: () => null,
})
import type { ProjectCanvasStageHandle } from "./project-canvas-stage"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { RightPanelIconButton } from "./right-panel-controls"
import { IconColorField } from "./fields/icon-color-field"
import { IconNumericField } from "./fields/icon-numeric-field"
import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { useResizableSidebar } from "./use-resizable-sidebar"
import type { Unit } from "@/lib/editor/units"
import type { EditorRightPanelSection } from "@/services/editor/section-registry"

export const ProjectEditorRightPanel = React.memo(function ProjectEditorRightPanel(props: {
  panelWidthRem: number
  minPanelRem: number
  maxPanelRem: number
  onPanelWidthRemChange: (next: number) => void
  activeSection: EditorRightPanelSection
  pageBgEnabled: boolean
  pageBgColor: string
  pageBgOpacity: number
  onPageBgEnabledChange: (v: boolean) => void
  onPageBgColorChange: (v: string) => void
  onPageBgOpacityChange: (v: number) => void
  masterImage: { signedUrl?: string | null; name?: string | null } | null
  masterImageLoading: boolean
  deleteBusy: boolean
  deleteError: string
  setDeleteError: (v: string) => void
  restoreOpen: boolean
  setRestoreOpen: (v: boolean) => void
  restoreBusy: boolean
  restoreError: string
  onRestoreImage: () => void | Promise<void>
  deleteOpen: boolean
  setDeleteOpen: (v: boolean) => void
  handleDeleteMasterImage: () => void | Promise<void>
  onRequestDeleteImage: () => void
  canDeleteActiveImage: boolean
  panelImageTxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  workspaceUnit: Unit
  workspaceReady: boolean
  imageStateLoading: boolean
  imagePanelReady: boolean
  imagePanelLocked?: boolean
  gridVisible: boolean
  onGridVisibleChange: (v: boolean) => void
  canvasRef: React.RefObject<ProjectCanvasStageHandle | null>
}) {
  const {
    panelWidthRem,
    minPanelRem,
    maxPanelRem,
    onPanelWidthRemChange,
    activeSection,
    pageBgColor,
    pageBgOpacity,
    onPageBgEnabledChange,
    onPageBgColorChange,
    onPageBgOpacityChange,
    masterImage,
    masterImageLoading,
    deleteBusy,
    deleteError,
    restoreOpen,
    setRestoreOpen,
    restoreBusy,
    restoreError,
    onRestoreImage,
    deleteOpen,
    setDeleteOpen,
    handleDeleteMasterImage,
    onRequestDeleteImage,
    canDeleteActiveImage,
    panelImageTxU,
    workspaceUnit,
    workspaceReady,
    imageStateLoading,
    imagePanelReady,
    imagePanelLocked = false,
    gridVisible,
    onGridVisibleChange,
    canvasRef,
  } = props

  const clamp = (v: number) => Math.max(minPanelRem, Math.min(maxPanelRem, v))
  const startResize = useResizableSidebar()

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startResize({
      startClientX: e.clientX,
      startWidthRem: panelWidthRem,
      minRem: minPanelRem,
      maxRem: maxPanelRem,
      direction: "expand-left",
      onWidthRemChange: onPanelWidthRemChange,
    })
  }

  return (
    <>
      <aside
        className="shrink-0 border-l bg-background relative"
        style={{ width: `${clamp(panelWidthRem)}rem` }}
      >
        {/* Resize handle (use border line; no separate visual handle). */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize"
          onMouseDown={onResizeMouseDown}
        />
        <SidebarFrame className="block h-full min-h-0 w-full">
          <SidebarContent className="gap-0">
            {activeSection === "artboard" ? (
              <>
                <EditorSidebarSection title="Page">
                  <PanelTwoFieldRow>
                    <IconColorField
                      value={pageBgColor}
                      onChange={onPageBgColorChange}
                      ariaLabel="Page background color"
                      inputClassName="cursor-pointer"
                    />

                    <IconNumericField
                      value={String(pageBgOpacity)}
                      mode="int"
                      ariaLabel="Page background opacity percent"
                      icon={<Percent aria-hidden="true" strokeWidth={1} />}
                      onValueChange={(next) => {
                        const n = Number(next)
                        const clamped = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
                        onPageBgOpacityChange(clamped)
                      }}
                    />

                    <PanelIconSlot>
                      <RightPanelIconButton
                        type="button"
                        aria-label="Hide page background"
                        onClick={() => onPageBgEnabledChange(false)}
                      >
                        <EyeOff className="size-4" strokeWidth={1} />
                      </RightPanelIconButton>
                    </PanelIconSlot>
                  </PanelTwoFieldRow>
                </EditorSidebarSection>
                <EditorSidebarSection title="Artboard" testId="editor-artboard-panel">
                  <ArtboardPanel />
                </EditorSidebarSection>
              </>
            ) : null}
            {activeSection === "grid" ? (
              <GridPanel gridVisible={gridVisible} onGridVisibleChange={onGridVisibleChange} />
            ) : null}
            {activeSection === "image" ? (
              <EditorSidebarSection
                title="Image"
                headerActions={
                  <>
                    <RightPanelIconButton
                      type="button"
                      disabled={!masterImage || masterImageLoading || deleteBusy || restoreBusy}
                      aria-label="Restore image"
                      onClick={() => setRestoreOpen(true)}
                    >
                      <RotateCcw className="size-4" strokeWidth={1} />
                    </RightPanelIconButton>
                    <RightPanelIconButton
                      type="button"
                      disabled={!masterImage || masterImageLoading || deleteBusy || !canDeleteActiveImage}
                      aria-label="Delete image"
                      onClick={onRequestDeleteImage}
                    >
                      <Trash2 className="size-4" strokeWidth={1} />
                    </RightPanelIconButton>
                  </>
                }
              >
                <ImagePanel
                  widthPxU={panelImageTxU?.w}
                  heightPxU={panelImageTxU?.h}
                  xPxU={panelImageTxU?.x}
                  yPxU={panelImageTxU?.y}
                  unit={workspaceUnit}
                  ready={imagePanelReady}
                  disabled={!masterImage || imageStateLoading || !workspaceReady || imagePanelLocked}
                  onCommit={(w, h) => canvasRef.current?.setImageSize(w, h)}
                  onCommitPosition={(x, y) => canvasRef.current?.setImagePosition(x, y)}
                  onAlign={(opts) => canvasRef.current?.alignImage(opts)}
                />
              </EditorSidebarSection>
            ) : null}

            <div className="flex-1 overflow-auto p-4">
              {/* reserved for future controls */}
            </div>
          </SidebarContent>
        </SidebarFrame>
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
            <AppButton type="button" variant="outline" onClick={() => setRestoreOpen(false)} disabled={restoreBusy}>
              Cancel
            </AppButton>
            <AppButton
              type="button"
              onClick={onRestoreImage}
              disabled={restoreBusy}
            >
              {restoreBusy ? "Restoring…" : "Restore"}
            </AppButton>
          </DialogFooter>
          {restoreError ? <div className="text-sm text-destructive">{restoreError}</div> : null}
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
            <AppButton type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
              Cancel
            </AppButton>
            <AppButton type="button" variant="destructive" onClick={handleDeleteMasterImage} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete"}
            </AppButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})

ProjectEditorRightPanel.displayName = "ProjectEditorRightPanel"

