"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PixelateForm, type PixelateFormData } from "./pixelate-form"
import { applyPixelateFilter } from "@/lib/api/project-images"

type Props = {
  projectId: string
  workingImageId: string
  workingImageWidth: number
  workingImageHeight: number
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function PixelateFilterController({
  projectId,
  workingImageId,
  workingImageWidth,
  workingImageHeight,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [busy, setBusy] = useState(false)

  const handleCancel = () => {
    if (busy) return
    onClose()
  }

  const handleApply = async (data: PixelateFormData) => {
    if (busy) return
    setBusy(true)
    try {
      await applyPixelateFilter({
        projectId,
        sourceImageId: workingImageId,
        superpixelWidth: data.superpixelWidth,
        superpixelHeight: data.superpixelHeight,
        colorMode: data.colorMode,
        numColors: data.numColors,
      })
      onSuccess()
      onClose()
    } catch (e) {
      console.error("Failed to apply pixelate filter:", e)
      alert(e instanceof Error ? e.message : "Failed to apply filter")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pixelate</DialogTitle>
          <DialogDescription>Configure pixelate filter settings.</DialogDescription>
        </DialogHeader>
        <PixelateForm
          imageWidth={workingImageWidth}
          imageHeight={workingImageHeight}
          onCancel={handleCancel}
          onApply={handleApply}
          busy={busy}
        />
      </DialogContent>
    </Dialog>
  )
}
