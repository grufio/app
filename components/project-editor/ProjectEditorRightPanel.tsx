"use client"

import * as React from "react"
import { EyeOff, Palette, Percent, RotateCcw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ArtboardPanel, ImagePanel, type ProjectCanvasStageHandle } from "@/components/shared/editor"
import { PanelIconSlot, PanelTwoFieldRow } from "@/components/shared/editor/panel-layout"
import type { Unit } from "@/lib/editor/units"
import { NumericInput } from "@/components/shared/editor/numeric-input"

export function ProjectEditorRightPanel(props: {
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
  workspaceDpi: number
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
    workspaceDpi,
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
          <div className="border-b px-4 py-3">
            <div className="flex h-6 items-center text-xs font-medium text-sidebar-foreground/70">Page</div>
            <div className="mt-3">
              <PanelTwoFieldRow>
                <InputGroup>
                  <InputGroupInput
                    type="color"
                    value={pageBgColor}
                    onChange={(e) => onPageBgColorChange(e.target.value)}
                    aria-label="Page background color"
                    className="cursor-pointer"
                  />
                  <InputGroupAddon align="inline-start">
                    <Palette aria-hidden="true" />
                  </InputGroupAddon>
                </InputGroup>

                <InputGroup>
                  <NumericInput
                    value={String(pageBgOpacity)}
                    mode="int"
                    onValueChange={(next) => {
                      const n = Number(next)
                      const clamped = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
                      onPageBgOpacityChange(clamped)
                    }}
                    aria-label="Page background opacity percent"
                  />
                  <InputGroupAddon align="inline-start">
                    <Percent aria-hidden="true" />
                  </InputGroupAddon>
                </InputGroup>

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
            </div>
          </div>
          {activeSection === "artboard" ? (
            <div className="border-b px-4 py-3" data-testid="editor-artboard-panel">
              <div className="flex h-6 items-center text-xs font-medium text-sidebar-foreground/70">Artboard</div>
              <div className="mt-3">
                <ArtboardPanel />
              </div>
            </div>
          ) : null}
          {activeSection === "image" ? (
            <div className="border-b px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-sidebar-foreground/70">Image</div>
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
              <div className="mt-3">
                <ImagePanel
                  widthPxU={panelImagePxU?.w}
                  heightPxU={panelImagePxU?.h}
                  unit={workspaceUnit}
                  dpi={workspaceDpi}
                  ready={imagePanelReady}
                  disabled={!masterImage || imageStateLoading || !workspaceReady}
                  onCommit={(w, h) => canvasRef.current?.setImageSize(w, h)}
                  onAlign={(opts) => canvasRef.current?.alignImage(opts)}
                />
              </div>
            </div>
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
}

