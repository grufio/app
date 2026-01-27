"use client"

import * as React from "react"
import { RotateCcw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArtboardPanel, ImagePanel } from "@/components/shared/editor"

export function ProjectEditorRightPanel(props: {
  panelWidthRem: number
  minPanelRem: number
  maxPanelRem: number
  onPanelWidthRemChange: (next: number) => void
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
  workspaceUnit: string
  workspaceDpi: number
  workspaceReady: boolean
  imageStateLoading: boolean
  imagePanelReady: boolean
  canvasRef: React.RefObject<{
    setImageSize: (w: bigint, h: bigint) => void
    alignImage: (opts: unknown) => void
    restoreImage: () => void
  } | null>
}) {
  const {
    panelWidthRem,
    minPanelRem,
    maxPanelRem,
    onPanelWidthRemChange,
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
          <div className="border-b px-4 py-3" data-testid="editor-artboard-panel">
            <div className="flex h-6 items-center text-sm font-medium">Artboard</div>
            <div className="mt-3">
              <ArtboardPanel />
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

