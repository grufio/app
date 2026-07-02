"use client"

/**
 * Confirmation shown before applying a trace when the image does not fully
 * cover the printable content area (artboard − padding). The uncovered area is
 * rendered white; the user confirms first. Mirrors the delete-image confirm
 * dialog chrome (title + description + Cancel/primary footer).
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AppButton } from "@/components/ui/form-controls"

export function TraceCoverageDialog(props: {
  open: boolean
  onCancel: () => void
  onProceed: () => void
}) {
  const { open, onCancel, onProceed } = props
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onCancel() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attention</DialogTitle>
          <DialogDescription>
            The image does not cover the image area. Missing areas will be replaced with white. Do you
            really want to continue?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <AppButton type="button" variant="outline" onClick={onCancel}>
            Cancel
          </AppButton>
          <AppButton type="button" onClick={onProceed}>
            Proceed
          </AppButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
