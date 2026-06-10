"use client"

/**
 * Viewport-agnostic host for the Restore + Delete image confirmation
 * dialogs. Mounted once at the editor shell root (next to the unlock
 * dialog) so both viewports — desktop section model and mobile sheets
 * — drive the same Radix-portaled dialogs through shell state.
 *
 * Previously these dialogs lived inside `ProjectEditorRightPanel`,
 * which only existed on desktop; the mobile artboard sheet already
 * routed `onRequestRestore`/`onRequestDelete` to the shell state this
 * host now renders against. Relocating them here is the prerequisite
 * for deleting the right panel without breaking Restore/Delete on
 * either viewport.
 *
 * No `useDialogFocusReturn` capture this phase — mobile already ran
 * without it, and the section-model editor has no single trigger
 * element to return focus to.
 */
import type { OperationError } from "@/lib/api/operation-error"
import { AppButton } from "@/components/ui/form-controls"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { buildDeleteMessage } from "./delete-message"

export function EditorImageDialogs(props: {
  restoreOpen: boolean
  setRestoreOpen: (v: boolean) => void
  restoreBusy: boolean
  restoreError: OperationError | null
  onRestoreImage: () => void | Promise<void>
  deleteOpen: boolean
  setDeleteOpen: (v: boolean) => void
  deleteBusy: boolean
  deleteError: string
  handleDeleteMasterImage: () => void | Promise<void>
  /** Count of `project_image_filters` rows cascade-deleted alongside
   * the master. Drives the dialog copy. */
  cascadeFilterCount: number
  /** Whether a `project_image_trace` row exists. Drives the copy. */
  cascadeHasTrace: boolean
}) {
  const {
    restoreOpen,
    setRestoreOpen,
    restoreBusy,
    restoreError,
    onRestoreImage,
    deleteOpen,
    setDeleteOpen,
    deleteBusy,
    deleteError,
    handleDeleteMasterImage,
    cascadeFilterCount,
    cascadeHasTrace,
  } = props

  return (
    <>
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
            <AppButton type="button" onClick={onRestoreImage} disabled={restoreBusy}>
              {restoreBusy ? "Restoring…" : "Restore"}
            </AppButton>
          </DialogFooter>
          {restoreError ? <div role="alert" className="text-sm text-destructive">{restoreError.message}</div> : null}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => (deleteBusy ? null : setDeleteOpen(o))}>
        <DialogContent>
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
}
