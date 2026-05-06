"use client"

import { ReactNode, useState } from "react"
import { toast } from "sonner"

import { normalizeApiError } from "@/lib/api/error-normalizer"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Props for the BaseFilterController component.
 * 
 * @typeParam TFormData - The type of data structure the filter form collects
 */
type BaseFilterControllerProps<TFormData> = {
  /** Controls dialog visibility */
  open: boolean
  /** Called when the dialog is closed or cancelled */
  onClose: () => void
  /** Called after the filter is successfully applied */
  onSuccess: () => void
  /** Optional custom error handler. If not provided, shows a default alert */
  onError?: (error: Error) => void
  /** Dialog title displayed in the header */
  title: string
  /** Dialog description/subtitle displayed below the title */
  description: string
  /** Render prop that receives busy state and action handlers */
  children: (props: {
    busy: boolean
    onCancel: () => void
    onApply: (data: TFormData) => Promise<void>
  }) => ReactNode
  /** Async function that applies the filter with the given form data */
  applyFilter: (data: TFormData) => Promise<void>
}

/**
 * Base controller component for filter dialogs.
 * 
 * Provides common functionality for all filter types:
 * - Dialog state management (open/close)
 * - Busy state during async operations
 * - Error handling with optional custom callback
 * - Render-prop pattern for flexible form content
 * 
 * @typeParam TFormData - The type of data structure the filter form collects
 * 
 * @example
 * ```tsx
 * <BaseFilterController<MyFilterData>
 *   open={isOpen}
 *   onClose={handleClose}
 *   onSuccess={handleSuccess}
 *   title="My Filter"
 *   description="Configure settings"
 *   applyFilter={async (data) => await applyMyFilter(data)}
 * >
 *   {({ busy, onCancel, onApply }) => (
 *     <MyFilterForm busy={busy} onCancel={onCancel} onApply={onApply} />
 *   )}
 * </BaseFilterController>
 * ```
 */
export function BaseFilterController<TFormData>({
  open,
  onClose,
  onSuccess,
  onError,
  title,
  description,
  children,
  applyFilter,
}: BaseFilterControllerProps<TFormData>) {
  const [busy, setBusy] = useState(false)

  /**
   * Handles dialog cancellation.
   * Closes the dialog only if not currently busy with an operation.
   */
  const handleCancel = () => {
    if (busy) return
    onClose()
  }

  /**
   * Handles filter application with error handling.
   * 
   * - Prevents concurrent operations via busy state
   * - Calls the provided applyFilter function
   * - On success: triggers onSuccess callback and closes dialog
   * - On error: calls custom onError handler or shows default alert
   * 
   * @param data - The form data to apply to the filter
   */
  const handleApply = async (data: TFormData) => {
    if (busy) return
    setBusy(true)
    try {
      await applyFilter(data)
      onSuccess()
      onClose()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      console.error("Failed to apply filter:", error)
      if (onError) {
        onError(error)
        return
      }
      // Single source of truth for stage→friendly-copy mapping lives in
      // lib/api/error-normalizer; just render what it gives us.
      const normalized = normalizeApiError(error)
      toast.error(normalized.title, normalized.detail ? { description: normalized.detail } : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children({ busy, onCancel: handleCancel, onApply: handleApply })}
      </DialogContent>
    </Dialog>
  )
}
