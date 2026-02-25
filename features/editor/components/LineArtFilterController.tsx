"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LineArtForm, type LineArtFormData } from "./lineart-form"
import { applyLineArtFilter } from "@/lib/api/project-images"

type Props = {
  projectId: string
  workingImageId: string
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function LineArtFilterController({
  projectId,
  workingImageId,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [busy, setBusy] = useState(false)

  const handleCancel = () => {
    if (busy) return
    onClose()
  }

  const handleApply = async (data: LineArtFormData) => {
    if (busy) return
    setBusy(true)
    try {
      await applyLineArtFilter({
        projectId,
        sourceImageId: workingImageId,
        threshold1: data.threshold1,
        threshold2: data.threshold2,
        lineThickness: data.lineThickness,
        blurAmount: data.blurAmount,
        minContourArea: data.minContourArea,
        invert: data.invert,
        smoothness: data.smoothness,
      })
      onSuccess()
      onClose()
    } catch (e) {
      console.error("Failed to apply line art filter:", e)
      alert(e instanceof Error ? e.message : "Failed to apply filter")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Line Art</DialogTitle>
          <DialogDescription>Create comic-style outlines with edge detection.</DialogDescription>
        </DialogHeader>
        <LineArtForm
          onCancel={handleCancel}
          onApply={handleApply}
          busy={busy}
        />
      </DialogContent>
    </Dialog>
  )
}
