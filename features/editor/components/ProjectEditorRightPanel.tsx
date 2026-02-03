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

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { IconColorField } from "./fields/icon-color-field"
import { IconNumericField } from "./fields/icon-numeric-field"
import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import type { Unit } from "@/lib/editor/units"

export const ProjectEditorRightPanel = React.memo(function ProjectEditorRightPanel(props: {
  panelWidthRem: number
  minPanelRem: number
  maxPanelRem: number
  onPanelWidthRemChange: (next: number) => void
  activeSection: "artboard" | "image"
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
  deleteOpen: boolean
  setDeleteOpen: (v: boolean) => void
  handleDeleteMasterImage: () => void | Promise<void>
  panelImagePxU: { w: bigint; h: bigint } | null
  workspaceUnit: Unit
  workspaceReady: boolean
  imageStateLoading: boolean
  imagePanelReady: boolean
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
    setDeleteError,
    restoreOpen,
    setRestoreOpen,
    deleteOpen,
    setDeleteOpen,
    handleDeleteMasterImage,
    panelImagePxU,
    workspaceUnit,
    workspaceReady,
    imageStateLoading,
    imagePanelReady,
    canvasRef,
  } = props

  const clamp = (v: number) => Math.max(minPanelRem, Math.min(maxPanelRem, v))

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    const startX = e.clientX
    const startWidthPx = panelWidthRem * 16

    const onMove = (ev: MouseEvent) => {
      const nextWidthPx = startWidthPx + (startX - ev.clientX)
      const nextRem = clamp(nextWidthPx / 16)
      onPanelWidthRemChange(nextRem)
    }

    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
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
        <div className="flex h-full flex-col">
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
                    icon={<Percent aria-hidden="true" />}
                    onValueChange={(next) => {
                      const n = Number(next)
                      const clamped = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
                      onPageBgOpacityChange(clamped)
                    }}
                  />

                  <PanelIconSlot>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Hide page background"
                      onClick={() => onPageBgEnabledChange(false)}
                    >
                      <EyeOff className="size-4" />
                    </Button>
                  </PanelIconSlot>
                </PanelTwoFieldRow>
              </EditorSidebarSection>
              <GridPanel />
              <EditorSidebarSection title="Artboard" testId="editor-artboard-panel">
                <ArtboardPanel />
              </EditorSidebarSection>
            </>
          ) : null}
          {activeSection === "image" ? (
            <EditorSidebarSection
              title="Image"
              headerActions={
                <>
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
                </>
              }
            >
              <ImagePanel
                widthPxU={panelImagePxU?.w}
                heightPxU={panelImagePxU?.h}
                unit={workspaceUnit}
                ready={imagePanelReady}
                disabled={!masterImage || imageStateLoading || !workspaceReady}
                onCommit={(w, h) => canvasRef.current?.setImageSize(w, h)}
                onAlign={(opts) => canvasRef.current?.alignImage(opts)}
              />
            </EditorSidebarSection>
          ) : null}

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
    </>
  )
})

ProjectEditorRightPanel.displayName = "ProjectEditorRightPanel"

