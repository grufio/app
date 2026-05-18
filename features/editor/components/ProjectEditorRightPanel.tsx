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
import { Eye, EyeOff, Percent } from "lucide-react"

import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import type { OperationError } from "@/lib/api/operation-error"
import { AppButton, FormField } from "@/components/ui/form-controls"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useDialogFocusReturn } from "@/lib/dialog/use-dialog-focus-return"
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
import { buildDeleteMessage } from "./delete-message"
import type { ProjectCanvasStageHandle } from "./project-canvas-stage"
import { PanelIconSlot, PanelTwoFieldRow } from "./panel-layout"
import { RightPanelToggleIconButton } from "./right-panel-controls"
import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { useResizableSidebar } from "./use-resizable-sidebar"
import type { Unit } from "@/lib/editor/units"
import { useImagePanelEnabled } from "@/lib/editor/hooks/use-image-panel-enabled"
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
  restoreError: OperationError | null
  onRestoreImage: () => void | Promise<void>
  deleteOpen: boolean
  setDeleteOpen: (v: boolean) => void
  handleDeleteMasterImage: () => void | Promise<void>
  onRequestDeleteImage: () => void
  /** Count of `project_image_filters` rows that will be cascade-
   * deleted alongside the master. Drives the dialog copy. */
  cascadeFilterCount: number
  /** Whether a `project_image_trace` row exists for the project.
   * Drives the dialog copy. */
  cascadeHasTrace: boolean
  panelImageTxU: { x: bigint; y: bigint; w: bigint; h: bigint } | null
  workspaceUnit: Unit
  workspaceReady: boolean
  imagePanelReady: boolean
  gridVisible: boolean
  onGridVisibleChange: (v: boolean) => void
  canvasRef: React.RefObject<ProjectCanvasStageHandle | null>
  /** Mobile drawer state. Ignored on `md+` where the panel is
   * always rendered as a static sidebar. */
  open?: boolean
  /** Mobile drawer onOpenChange. Triggered by Sheet's built-in
   * close (Escape, overlay click, X button). Ignored on `md+`. */
  onOpenChange?: (open: boolean) => void
}) {
  const {
    panelWidthRem,
    minPanelRem,
    maxPanelRem,
    onPanelWidthRemChange,
    activeSection,
    pageBgEnabled,
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
    cascadeFilterCount,
    cascadeHasTrace,
    panelImageTxU,
    workspaceUnit,
    workspaceReady,
    imagePanelReady,
    gridVisible,
    onGridVisibleChange,
    canvasRef,
    open = true,
    onOpenChange,
  } = props

  const restoreFocusReturn = useDialogFocusReturn()
  const deleteFocusReturn = useDialogFocusReturn()

  const imagePanelEnabled = useImagePanelEnabled({
    hasMasterImage: Boolean(masterImage),
    workspaceReady,
  })

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

  const panelBody = (
    <SidebarFrame className="block h-full min-h-0 w-full">
      <SidebarContent className="gap-0">
            {activeSection === "artboard" ? (
              <>
                <EditorSidebarSection title="Page">
                  <PanelTwoFieldRow>
                    <FormField
                      variant="color"
                      label="Page background color"
                      labelVisuallyHidden
                      value={pageBgColor}
                      onCommit={onPageBgColorChange}
                      inputClassName="cursor-pointer"
                    />

                    <FormField
                      variant="numeric"
                      numericMode="int"
                      label="Page background opacity percent"
                      labelVisuallyHidden
                      iconStart={<Percent aria-hidden="true" />}
                      value={String(pageBgOpacity)}
                      onCommit={(next) => {
                        const n = Number(next)
                        const clamped = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0))
                        onPageBgOpacityChange(clamped)
                      }}
                    />

                    <PanelIconSlot>
                      <RightPanelToggleIconButton
                        type="button"
                        active={!pageBgEnabled}
                        aria-label={pageBgEnabled ? "Hide page background" : "Show page background"}
                        onClick={() => onPageBgEnabledChange(!pageBgEnabled)}
                      >
                        {pageBgEnabled ? (
                          <Eye className="size-4" />
                        ) : (
                          <EyeOff className="size-4" />
                        )}
                      </RightPanelToggleIconButton>
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
              <ImagePanel
                widthPxU={panelImageTxU?.w}
                heightPxU={panelImageTxU?.h}
                xPxU={panelImageTxU?.x}
                yPxU={panelImageTxU?.y}
                unit={workspaceUnit}
                ready={imagePanelReady}
                disabled={!imagePanelEnabled.enabled}
                onCommit={(w, h) => canvasRef.current?.setImageSize(w, h)}
                onCommitPosition={(opts) => canvasRef.current?.setImagePosition(opts)}
                onAlign={(opts) => canvasRef.current?.alignImage(opts)}
                canRestore={Boolean(masterImage) && !masterImageLoading && !deleteBusy && !restoreBusy}
                canDelete={Boolean(masterImage) && !masterImageLoading && !deleteBusy}
                onRestore={() => {
                  restoreFocusReturn.captureOnOpen()
                  setRestoreOpen(true)
                }}
                onDelete={() => {
                  deleteFocusReturn.captureOnOpen()
                  onRequestDeleteImage()
                }}
              />
            ) : null}

            <div className="flex-1 overflow-auto p-4">
              {/* reserved for future controls */}
            </div>
          </SidebarContent>
        </SidebarFrame>
  )

  return (
    <>
      {/* Desktop: static sidebar within the editor layout flex row.
       * `hidden md:flex` keeps it out of the DOM-paint layer on mobile
       * (display:none, no layout space, no flash during hydration). */}
      <aside
        id="right-panel"
        className="relative hidden shrink-0 flex-col border-l bg-background md:flex"
        style={{ width: `${clamp(panelWidthRem)}rem` }}
      >
        {/* Resize handle (use border line; no separate visual handle). */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize"
          onMouseDown={onResizeMouseDown}
        />
        {panelBody}
      </aside>

      {/* Mobile: Radix Sheet (Dialog) — portal-mounted. The contents
       * are only rendered to the DOM while `open` is true, so on
       * desktop (where the toggle button is `md:hidden` and can't
       * fire) the panel body is never double-mounted. Sheet handles
       * overlay, focus-trap, Escape, and slide-in animation. */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-md">
          <SheetTitle className="sr-only">Info panel</SheetTitle>
          {panelBody}
        </SheetContent>
      </Sheet>

      {/* Restore confirmation dialog */}
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent onCloseAutoFocus={restoreFocusReturn.onCloseAutoFocus}>
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
          {restoreError ? <div role="alert" className="text-sm text-destructive">{restoreError.message}</div> : null}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => (deleteBusy ? null : setDeleteOpen(o))}>
        <DialogContent onCloseAutoFocus={deleteFocusReturn.onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Delete image?</DialogTitle>
            <DialogDescription>
              {buildDeleteMessage({ cascadeFilterCount, cascadeHasTrace })}
            </DialogDescription>
          </DialogHeader>

          {deleteError ? <div role="alert" className="text-sm text-destructive">{deleteError}</div> : null}

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

